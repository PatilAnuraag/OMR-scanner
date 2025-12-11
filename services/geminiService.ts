import { GoogleGenAI, Type, Schema } from "@google/genai";
import { PageType } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Schemas ---

const schemaStudentInfo: Schema = {
  type: Type.OBJECT,
  properties: {
    firstName: { type: Type.STRING, description: "First Name" },
    lastName: { type: Type.STRING, description: "Last Name (if single name, repeat First Name)" },
    parentName: { type: Type.STRING, description: "Parent / Guardian Name" },
    schoolName: { type: Type.STRING, description: "School Name" },
    date: { type: Type.STRING, description: "Date in YYYY-MM-DD format" },
    grade: { type: Type.STRING, description: "Grade in 'Class X' format (e.g. Class 9)" },
    city: { type: Type.STRING, description: "City name" },
    whatsappNumber: { type: Type.STRING, description: "Phone number derived from filled bubbles in D1-D10 columns" },
    email: { type: Type.STRING, description: "Parent Email ID" },
    studentId: { type: Type.STRING, description: "Printed Sheet ID/Student ID (e.g. 100255)" },
    confidenceScore: { type: Type.NUMBER, description: "Confidence 0-1" }
  },
  required: ["firstName", "lastName", "whatsappNumber", "studentId", "confidenceScore"]
};

const schemaVibeMatch: Schema = {
  type: Type.OBJECT,
  properties: {
    answers: {
      type: Type.OBJECT,
      properties: {
        q1: { type: Type.INTEGER, nullable: true },
        q2: { type: Type.INTEGER, nullable: true },
        q3: { type: Type.INTEGER, nullable: true },
        q4: { type: Type.INTEGER, nullable: true },
        q5: { type: Type.INTEGER, nullable: true },
        q6: { type: Type.INTEGER, nullable: true },
        q7: { type: Type.INTEGER, nullable: true },
        q8: { type: Type.INTEGER, nullable: true },
        q9: { type: Type.INTEGER, nullable: true },
        q10: { type: Type.INTEGER, nullable: true },
        q11: { type: Type.INTEGER, nullable: true },
        q12: { type: Type.INTEGER, nullable: true },
        q13: { type: Type.INTEGER, nullable: true },
        q14: { type: Type.INTEGER, nullable: true },
      },
      required: ["q1", "q5", "q10"] // Require a few to ensure structure
    },
    handwrittenStatement: { type: Type.STRING, description: "Q15 Handwritten text answer" },
    studentId: { type: Type.STRING, description: "Printed Sheet ID/Student ID (e.g. 100039)" },
    confidenceScore: { type: Type.NUMBER }
  },
  required: ["answers", "studentId", "confidenceScore"]
};

const schemaEduStats: Schema = {
  type: Type.OBJECT,
  properties: {
    q1: { type: Type.STRING, description: "Q1: Grade (e.g. 8, 9, 10)" },
    q2: { type: Type.STRING, description: "Q2: Education Board (e.g. CBSE)" },
    q3: { type: Type.STRING, description: "Q3: Subjects study (comma separated if multiple)" },
    q4: { type: Type.STRING, description: "Q4: Recent percentage/grade" },
    q5: { type: Type.STRING, description: "Q5: Rank in class (e.g. Top 10, Avg)" },
    q6: { type: Type.STRING, description: "Q6: Extracurricular activities (comma separated)" },
    q7: { type: Type.STRING, description: "Q7: Family careers (comma separated)" },
    q8: { type: Type.STRING, description: "Q8: Handwritten text (Careers good/discouraged)" },
    q9: { type: Type.STRING, description: "Q9: Vocational training (Yes/No/Maybe)" },
    q10: { type: Type.STRING, description: "Q10: Study abroad (Yes/No/Maybe)" },
    q11: { type: Type.STRING, description: "Q11: Preferred work style (e.g. Office, Remote)" },
    q12: { type: Type.STRING, description: "Q12: Handwritten text (Subjects enjoy most & why)" },
    q13: { type: Type.STRING, description: "Q13: Handwritten text (Job not want & why)" },
    q14: { type: Type.STRING, description: "Q14: Long study (Yes/No/Maybe)" },
    q15: { type: Type.STRING, description: "Q15: Choice if no constraints (Checkboxes/Handwritten)" },
    studentId: { type: Type.STRING, description: "Printed Sheet ID/Student ID" },
    confidenceScore: { type: Type.NUMBER }
  },
  required: ["q1", "q2", "studentId", "confidenceScore"]
};

// --- Service Function ---

export const processOmrImage = async (
  base64Image: string, 
  pageType: PageType
): Promise<{ data: any, confidenceScore: number }> => {
  
  const modelId = "gemini-2.5-flash";
  const cleanBase64 = base64Image.replace(/^data:image\/(png|jpg|jpeg|webp);base64,/, "");
  
  let systemPrompt = "";
  let responseSchema: Schema | undefined = undefined;

  switch (pageType) {
    case PageType.STUDENT_INFO:
      systemPrompt = `Analyze this Student Info OMR sheet image.
      
      Task: Extract student data into JSON.

      1. Student Name: Read block letters. Split into 'firstName' and 'lastName'.
      2. School Name: Read the handwritten school name.
      3. Date: Read date (YYYY-MM-DD).
      4. Grade/Class: Read class (e.g., 'Class 10').
      5. City: Read city.
      
      6. PARENT WHATSAPP NUMBER (CRITICAL):
         - Locate the bubble grid labeled "Parent WhatsApp Number".
         - Columns are D1 to D10.
         - DO NOT rely on reading the small numbers (0-9) next to bubbles as they may be blurry.
         - Instead, determine the digit by COUNTING the position of the filled bubble from the top of the column:
           * 1st bubble from top = 0
           * 2nd bubble from top = 1
           * 3rd bubble from top = 2
           * 4th bubble from top = 3
           * 5th bubble from top = 4
           * 6th bubble from top = 5
           * 7th bubble from top = 6
           * 8th bubble from top = 7
           * 9th bubble from top = 8
           * 10th bubble from top = 9
         - Perform this check for each column D1 to D10 independently.
         - Concatenate the digits to form the 10-digit number.
      
      7. Parent Email ID: Read handwritten email.
      
      8. Parent / Guardian Name: 
         - Locate the handwritten name labeled "Parent / Guardian Name".
         - It is typically below the Email ID field.
      
      9. Student ID: Read the printed number at bottom right (e.g. 100118).
      
      Return JSON.`;
      responseSchema = schemaStudentInfo;
      break;

    case PageType.VIBE_MATCH:
      systemPrompt = `Analyze this VIBEMatch Assessment OMR sheet (Section 1).
      1. Q1-Q14: Identify the filled bubble value (1 to 5) for each row.
      2. Q15: Transcribe the handwritten sentence at the bottom (e.g. "Training Because...").
      3. Read the printed ID (e.g. 100039) and map to 'studentId'.
      Return JSON.`;
      responseSchema = schemaVibeMatch;
      break;

    case PageType.EDU_STATS:
      systemPrompt = `Analyze this EduStats Assessment OMR sheet (Page 3).
      Extract answers for Q1 through Q15.
      Q1: Grade (Bubble).
      Q2: Board (Bubble).
      Q3: Subjects (Checkboxes - list all checked, comma separated if multiple).
      Q4: Recent Percentage (Bubble/Handwritten).
      Q5: Rank in class (Bubble).
      Q6: Extracurriculars (Checkboxes - list all checked, comma separated).
      Q7: Family Careers (Checkboxes - list all checked, comma separated).
      Q8: Handwritten text (Careers good/discouraged).
      Q9: Vocational training (Bubble).
      Q10: Study abroad (Bubble).
      Q11: Preferred work style (Bubble).
      Q12: Handwritten text (Subjects enjoy most & why).
      Q13: Handwritten text (Job not want & why).
      Q14: Comfortable with long study (Bubble).
      Q15: Choice if no constraints (Checkboxes + Handwritten 'Other').
      Student ID: Read the printed ID (e.g. 100252).
      Return JSON.`;
      responseSchema = schemaEduStats;
      break;
  }

  let retryCount = 0;
  const maxRetries = 3;

  while (true) {
    try {
      const response = await ai.models.generateContent({
        model: modelId,
        contents: {
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: cleanBase64 } },
            { text: systemPrompt },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
          temperature: 0.1,
          thinkingConfig: { thinkingBudget: 2048 }, // Enable thinking for better accuracy especially for bubble counting
        },
      });

      let text = response.text || "{}";
      // Sanitize potential markdown code blocks
      text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      
      const parsed = JSON.parse(text);

      // Normalize VibeMatch structure to match flat type if needed, or just return as is
      if (pageType === PageType.VIBE_MATCH && parsed.answers) {
        return {
          data: {
            ...parsed.answers,
            // Ensure handwrittenStatement defaults to empty string if missing
            handwrittenStatement: parsed.handwrittenStatement || "",
            studentId: parsed.studentId
          },
          confidenceScore: parsed.confidenceScore
        };
      }

      // Fallback logic to ensure lastName is populated if AI missed it (though prompt handles it)
      if (pageType === PageType.STUDENT_INFO) {
         if (!parsed.lastName || parsed.lastName.trim() === '') {
           parsed.lastName = parsed.firstName;
         }
      }

      // For others, return directly (extracting confidence score out)
      const { confidenceScore, ...rest } = parsed;

      // Safety: ensure handwrittenStatement is present if VibeMatch, even in fallback path
      if (pageType === PageType.VIBE_MATCH && rest.handwrittenStatement === undefined) {
        rest.handwrittenStatement = "";
      }

      return { data: rest, confidenceScore };

    } catch (error: any) {
      const isRateLimit = error.message?.includes('429') || 
                          error.message?.includes('RESOURCE_EXHAUSTED') || 
                          error.status === 429;
                          
      if (isRateLimit && retryCount < maxRetries) {
        retryCount++;
        // Exponential backoff: 2s, 4s, 8s
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.warn(`Gemini API Rate Limit hit. Retrying in ${waitTime}ms... (Attempt ${retryCount}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        console.error("Gemini Error:", error);
        throw error;
      }
    }
  }
};