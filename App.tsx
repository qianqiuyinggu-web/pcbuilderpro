
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { PCPart, BuildSummary, PartCategory, GamePerformance } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getPartSuggestions = async (category: PartCategory): Promise<string[]> => {
  const prompt = `日本市場で人気の自作PC用 ${category} を10個、名称のみ箇条書きでリストアップしてください。余計な説明は不要です。`;
  
  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    return response.text
      ?.split('\n')
      .map(line => line.replace(/^[・\-\d.\s]+/, '').trim())
      .filter(line => line.length > 0) || [];
  } catch (error) {
    console.error("Suggestions failed", error);
    return [];
  }
};

export const getBuildAdvice = async (parts: PCPart[]): Promise<BuildSummary> => {
  const partsList = parts.map(p => `${p.category}: ${p.name}`).join(', ');
  const prompt = `
    以下のPCパーツ構成を、ハードウェア専門家として徹底的に分析してください: ${partsList}.
    
    【重要タスク】
    1. 各パーツの現在日本市場における「Amazon.co.jpでのリアルタイム新品価格」と「中古相場」を詳しく調査してください。
       - 新品価格は必ずAmazon.co.jpの最新価格を取得し、その商品のAmazon商品ページURLを "amazonUrl" に含めてください。
       - 【Amazon URL生成ルール】: 
         - 固有の商品ページ（/dp/...）ではなく、以下の形式でAmazon検索URLを生成して "amazonUrl" に含めてください。
         - 形式: https://www.amazon.co.jp/s?k=検索クエリ&tag=あなたのID-22
         - 検索クエリは、メーカーが特定されている場合は「メーカー名+型番」、不問の場合は「カテゴリ+スペック」としてください。
         - 例: Intel Core i7-14700K → https://www.amazon.co.jp/s?k=Intel+Core+i7-14700K&tag=あなたのID-22
         - 例: DDR5 32GB メモリ → https://www.amazon.co.jp/s?k=DDR5+32GB+メモリ&tag=あなたのID-22
         - 空白は "+" に置き換えるか、URLエンコードしてください。
       - 【価格表記】:
         - 'priceNew' および 'priceUsed' に入れる価格文字列の最後には、必ず「円」をつけてください（例: "15,800円"）。
       - もし新品の販売が終了している（ディスコン）場合、過去に新品として販売されていた際の「最終的な新品価格」または「参考新品価格」を必ず含めてください。
       - priceNewには、販売中の場合はAmazonの現在価格を、販売終了の場合は過去の新品価格を数値がわかる形式で入れてください。
    2. 【AIアドバイスのリンク化】:
       - "recommendations" や "issues" の中で具体的なパーツや代替案を提案する場合、必ず上記の【Amazon URL生成ルール】に従った検索URLへの Markdown リンク（例: [パーツ名](URL) ）を含めてください。
    3. 【消費電力の論理的一貫性】:
       - システム全体の理論上の最大合計消費電力(W)を算出し "totalWattage" に入れてください。
       - もし構成に PSU（電源ユニット）が含まれている場合、その公称容量と "totalWattage" を比較してください。
       - 推奨電源容量は "totalWattage" の1.5倍〜2倍程度です。
       - ユーザーの電源容量が "totalWattage" を下回る、または余裕が20%未満の場合のみ「電源不足リスク」を "issues" に含めてください。
       - 逆に、電源容量が十分な場合は「電源不足」という矛盾したアドバイスを絶対に生成しないでください。
    4. 【物理干渉と規格チェック】を詳細に行ってください。
       - グラフィックボードの長さとケースの対応サイズ
       - CPUクーラーの高さとケースの横幅
       - マザーボードの規格（ATX等）とケースの対応
       - メモリの高さと大型空冷クーラーの干渉
    5. 構成に基づく性能ベンチマーク予測を3つ生成してください。
    
    JSON形式で返し、テキストは日本語にしてください。
    "totalWattage": 数値,
    "compatibilityScore": 数値,
    "issues": 文字列の配列（Markdownリンクを含む可能性あり）,
    "recommendations": 文字列の配列（Markdownリンクを含む可能性あり）,
    "partsWithPrices": Array<{
      category, 
      name, 
      priceNew, 
      priceUsed, 
      status,
      amazonUrl
    }>,
    "benchmarks": Array<{name, score, description}>,
    "detailedChecks": Array<{item, status, message}>
  `;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          totalWattage: { type: Type.NUMBER },
          compatibilityScore: { type: Type.NUMBER },
          issues: { type: Type.ARRAY, items: { type: Type.STRING } },
          recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
          partsWithPrices: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                category: { type: Type.STRING },
                name: { type: Type.STRING },
                priceNew: { type: Type.STRING },
                priceUsed: { type: Type.STRING },
                status: { type: Type.STRING },
                amazonUrl: { type: Type.STRING }
              },
              required: ["category", "name", "priceNew", "priceUsed", "status"]
            }
          },
          benchmarks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                score: { type: Type.STRING },
                description: { type: Type.STRING }
              },
              required: ["name", "score", "description"]
            }
          },
          detailedChecks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                item: { type: Type.STRING },
                status: { type: Type.STRING },
                message: { type: Type.STRING }
              },
              required: ["item", "status", "message"]
            }
          }
        },
        required: ["totalWattage", "compatibilityScore", "issues", "recommendations", "partsWithPrices", "benchmarks", "detailedChecks"]
      }
    },
  });

  const data = JSON.parse(response.text || '{}');
  const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
    title: chunk.web?.title || 'ソース',
    uri: chunk.web?.uri || '#'
  })) || [];

  return { ...data, sources };
};

export const estimateGamePerformance = async (parts: PCPart[], gameTitle: string): Promise<GamePerformance> => {
  const partsList = parts.map(p => `${p.category}: ${p.name}`).join(', ');
  const prompt = `
    PC構成 [${partsList}] で、最新のベンチマークデータを参考に、ゲーム「${gameTitle}」の動作FPSを詳細に推定してください。
    解像度ごとの平均FPSと、推奨されるグラフィック設定も含めてください。
    
    "gameTitle": 文字列,
    "fps1080p": 文字列,
    "fps1440p": 文字列,
    "fps4k": 文字列,
    "settings": 文字列
  `;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          gameTitle: { type: Type.STRING },
          fps1080p: { type: Type.STRING },
          fps1440p: { type: Type.STRING },
          fps4k: { type: Type.STRING },
          settings: { type: Type.STRING }
        },
        required: ["gameTitle", "fps1080p", "fps1440p", "fps4k", "settings"]
      }
    },
  });

  return JSON.parse(response.text || '{}');
};

export const generateBuildImage = async (parts: PCPart[]): Promise<string | null> => {
  const partsList = parts.map(p => p.name).join(', ');
  const prompt = `A professional cinematic high-end gaming PC build featuring ${partsList}. photorealistic, 8k resolution, custom RGB, clean tempered glass, organized interior.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: prompt }] },
    config: {
      imageConfig: {
        aspectRatio: "16:9"
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
};

export const createChat = (systemInstruction: string) => {
  return ai.chats.create({
    model: 'gemini-3-pro-preview',
    config: {
      systemInstruction: systemInstruction + " 回答はすべて日本語で行ってください。",
    },
  });
};
