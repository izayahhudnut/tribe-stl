
export interface UserProfile {
  name: string;
  age: string;
  photo: string | null;
  places: string[];
}

export interface ProcessingState {
  isProcessing: boolean;
  status: string;
  progress: number;
}
