import { notFound } from "next/navigation";
import { getKnowledgeArticleAction,KnowledgeArticleView } from "@/src/modules/knowledge-base";
export default async function KnowledgeArticlePage({params}:{params:Promise<{slug:string}>}){const{slug}=await params;const result=await getKnowledgeArticleAction(slug);if(!result.success||!result.data)notFound();return <KnowledgeArticleView article={result.data}/>}
