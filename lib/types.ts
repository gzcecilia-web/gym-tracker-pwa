export type RepsValue = number | number[] | string;

export type RoutineExercise = {
  name: string;
  reps: RepsValue;
  type?: 'normal' | 'dropset';
  notes?: string;
  sets?: number | null;
};

export type RoutineDay = {
  day: number;
  exercises: RoutineExercise[];
};

export type RoutineWeek = {
  week: number;
  days: RoutineDay[];
};

export type RoutinePlan = {
  id: string;
  name: string;
  month?: number;
  year?: number;
  weeks: RoutineWeek[];
};

export type RoutineProfile = {
  id: string;
  name: string;
  plans: RoutinePlan[];
};

export type RoutineDB = {
  defaultSetsIfMissing: number;
  profiles: RoutineProfile[];
};

export type WorkoutExerciseSnapshot = {
  name: string;
  reps?: RepsValue;
  sets?: number | null;
  type?: 'normal' | 'dropset';
};

export type WorkoutRecord = {
  version?: number;
  id: string;
  profileId: string;
  planId: string;
  week: number;
  day: number;
  createdAt: string;
  exercises: WorkoutExerciseSnapshot[];
  exerciseNames: string[];
  weights: Record<string, string | number>;
  weightsByExercise: Record<string, Record<string, string | number>>;
  checks?: Record<string, boolean>;
  completed?: boolean;
};

export type WorkoutDraft = {
  version?: number;
  profileId: string;
  planId: string;
  week: number;
  day: number;
  updatedAt: string;
  weights: Record<string, string | number>;
  checks?: Record<string, boolean>;
};

export type SelectedSlot = {
  profileId: string;
  planId: string;
  week: number;
  day: number;
};
