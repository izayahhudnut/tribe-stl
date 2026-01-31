
import { GoogleGenAI, Type } from "@google/genai";
import { FULL_STL_DATABASE, STL_DATABASE_TITLES, Place } from './database';

export const extractVideoPlaceList = async (
  frames: string[]
): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

  const prompt = `You are a Saint Louis Location Recognition Agent.
TASK: Analyze the provided video frames and list any place names you can read or infer.
Return only the place names as a JSON array. If none are found, return an empty array.`;

  const imageParts = frames.map(frame => ({
    inlineData: {
      mimeType: "image/jpeg",
      data: frame
    }
  }));

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        ...imageParts,
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          places: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Raw place names extracted from the video frames."
          }
        },
        required: ["places"]
      }
    }
  });

  try {
    const result = JSON.parse(response.text || '{"places": []}');
    return result.places || [];
  } catch (e) {
    console.error("Failed to parse extracted places", e);
    return [];
  }
};

export const matchPlacesToDatabase = async (
  extractedPlaces: string[]
): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

  const prompt = `You are matching a raw list of place names to the official St. Louis database.
RAW LIST: ${JSON.stringify(extractedPlaces)}

TASK: Return only items that exist in the provided database list. Do not add new items.
If none match, return an empty array.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          matches: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
              enum: STL_DATABASE_TITLES
            },
            description: "A list of confirmed locations from the database."
          }
        },
        required: ["matches"]
      }
    }
  });

  try {
    const result = JSON.parse(response.text || '{"matches": []}');
    return result.matches || [];
  } catch (e) {
    console.error("Failed to parse matched places", e);
    return [];
  }
};

export const getRecommendedPlaces = async (
  extractedListString: string,
  userPlaces: string[]
): Promise<(Place & { reason: string })[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

  const availableRecommendations = FULL_STL_DATABASE.filter(p => !userPlaces.includes(p.title));
  
  const databaseForPrompt = availableRecommendations.map(({ title, category, description }) => ({
    title,
    category,
    description: description.substring(0, 200) + '...'
  }));
  
  const prompt = `You are a St. Louis local expert and recommendation engine.
  A user has visited these places (raw list from video): ${extractedListString}.
  Matched list: ${JSON.stringify(userPlaces)}.
  
  TASK: Based on their visited places, recommend at least 10 new, diverse places from the provided database that they would also enjoy. For each recommendation, provide a short, compelling, one-sentence reason why it's a good match for them. Do not recommend places they have already visited.

  DATABASE:
  ${JSON.stringify(databaseForPrompt)}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          recommendations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: {
                  type: Type.STRING,
                  enum: availableRecommendations.map(p => p.title),
                  description: "The name of the recommended place. Must be from the database."
                },
                reason: {
                  type: Type.STRING,
                  description: "A short, one-sentence reason for the recommendation."
                }
              },
              required: ["name", "reason"]
            },
            description: "An array of at least 10 place recommendations."
          }
        },
        required: ["recommendations"]
      }
    }
  });

  try {
    const result = JSON.parse(response.text || '{"recommendations": []}');
    const recommendations: { name: string; reason: string }[] = result.recommendations || [];
    
    const mapped = recommendations
      .map(({ name, reason }) => {
        const place = FULL_STL_DATABASE.find(p => p.title === name);
        if (place) {
          return { ...place, reason }; // Combine place data with AI reason
        }
        return null;
      })
      .filter((p): p is Place & { reason: string } => p !== null);
    
    if (mapped.length >= 10) {
      return mapped;
    }

    const fallback = availableRecommendations
      .filter(p => !mapped.some(m => m.title === p.title))
      .slice(0, Math.max(0, 10 - mapped.length))
      .map(place => ({
        ...place,
        reason: "A solid match based on your St. Louis vibe."
      }));

    return [...mapped, ...fallback];

  } catch (e) {
    console.error("Failed to parse recommendations", e);
    return [];
  }
};

export const chatWithPlaceAssistant = async (
  userPlaces: string[],
  message: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

  const databaseTitles = FULL_STL_DATABASE.map(p => p.title).join(', ');

  const prompt = `You are Tribe STL's local city guide. 
User places: ${JSON.stringify(userPlaces)}.
Database places list: ${databaseTitles}.

Respond conversationally and helpfully. If recommending places, choose only from the database list. 
User message: ${message}`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt
  });

  return response.text?.trim() || "Sorry, I couldn't generate a response.";
};
