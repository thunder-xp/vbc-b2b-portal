export const EXPERTISE_SECTIONS = ["LAB", "ACADEMY"] as const;
export const EXPERTISE_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

export type ExpertiseSection = (typeof EXPERTISE_SECTIONS)[number];
export type ExpertiseStatus = (typeof EXPERTISE_STATUSES)[number];
export type ExpertiseLocale = "ru" | "ro";

export type PartnerExpertiseVideo = {
  id: string;
  section: ExpertiseSection;
  youtubeVideoId: string;
  youtubeUrl: string;
  title: string;
  description: string;
  publishedAt: string;
};

export type AdminExpertiseVideo = {
  id: string;
  section: ExpertiseSection;
  youtubeVideoId: string;
  youtubeUrl: string;
  titleRu: string;
  titleRo: string;
  descriptionRu: string;
  descriptionRo: string;
  status: ExpertiseStatus;
  sortOrder: number;
  revision: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExpertiseVideoInput = {
  id: string | null;
  section: ExpertiseSection;
  youtubeUrl: string;
  titleRu: string;
  titleRo: string;
  descriptionRu: string;
  descriptionRo: string;
  sortOrder: number;
  expectedRevision: number | null;
};
