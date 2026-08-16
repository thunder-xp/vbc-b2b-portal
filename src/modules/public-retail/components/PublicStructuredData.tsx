type Props = {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
};

export function PublicStructuredData({ data }: Props) {
  const payload = Array.isArray(data)
    ? { "@context": "https://schema.org", "@graph": data }
    : { "@context": "https://schema.org", ...data };

  return <script
    dangerouslySetInnerHTML={{ __html: JSON.stringify(payload).replace(/</g, "\\u003c") }}
    type="application/ld+json"
  />;
}
