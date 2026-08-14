export type PublicPartnerDirectoryRecord = {
  displayName: string;
  logoAssetPath: string | null;
};

export interface PublicPartnerDirectoryRepository {
  listPublished(): Promise<PublicPartnerDirectoryRecord[]>;
}
