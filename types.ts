export enum PageType {
  STUDENT_INFO = 'Page 1 (Info)',
  VIBE_MATCH = 'Page 2 (VibeMatch)',
  EDU_STATS = 'Page 3 (EduStats)',
  MIX = 'Mix (Auto-Detect)',
}

export interface StudentInfoData {
  firstName: string;
  lastName: string;
  studentName: string; // Added field for Full Name
  parentName: string;
  schoolName: string;
  date: string;
  grade: string;
  city: string;
  contactNumber: string;
  email: string;
  studentId: string;
}

export interface EduStatsData {
  q1: string; // Grade
  q2: string; // Board
  q3: string; // Subjects
  q4: string; // Percentage
  q5: string; // Rank
  q6: string; // Activities
  q7: string; // Family Careers
  q8: string; // Handwritten: Careers good/discouraged
  q9: string; // Vocational
  q10: string; // Study abroad
  q11: string; // Work style
  q12: string; // Handwritten: Subjects enjoy
  q13: string; // Handwritten: Job not want
  q14: string; // Long study
  q15: string; // Constraints choice
  studentId: string;
}

export interface VibeMatchData {
  q1: string | number | null;
  q2: string | number | null;
  q3: string | number | null;
  q4: string | number | null;
  q5: string | number | null;
  q6: string | number | null;
  q7: string | number | null;
  q8: string | number | null;
  q9: string | number | null;
  q10: string | number | null;
  q11: string | number | null;
  q12: string | number | null;
  q13: string | number | null;
  q14: string | number | null;
  // q15 is the handwrittenStatement
  handwrittenStatement: string;
  studentId: string;
}

export interface StudentRecord {
  id: string; // Unique ID for the react list
  pageType: PageType;
  data: StudentInfoData | EduStatsData | VibeMatchData;
  confidenceScore: number;
  originalImageUrl?: string;
  scannedAt: string;
}

export enum ScanStatus {
  IDLE = 'IDLE',
  SCANNING = 'SCANNING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}