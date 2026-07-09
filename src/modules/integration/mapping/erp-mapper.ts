export interface ERPMapper<TProviderPayload, TPlatformDTO> {
  toPlatformDTO(payload: TProviderPayload): TPlatformDTO;
  toProviderPayload(dto: TPlatformDTO): TProviderPayload;
}
