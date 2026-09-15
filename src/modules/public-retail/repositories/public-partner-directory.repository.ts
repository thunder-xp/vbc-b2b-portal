export type PublicPartnerDirectoryRecord = {
  displayName: string;
  logoAssetPath: string | null;
  providerId: string | null;
  verifiedReviewCount: number;
  averageVerifiedRating: number | null;
  completedVerifiedInstallations: number;
};

export interface PublicPartnerDirectoryRepository {
  listPublished(): Promise<PublicPartnerDirectoryRecord[]>;
}
