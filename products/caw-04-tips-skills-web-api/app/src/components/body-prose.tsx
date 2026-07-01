import { lexicalToParagraphs } from '@/lib/lexical'

export function BodyProse({ body }: { body: unknown }) {
  const paragraphs = lexicalToParagraphs(body)
  if (paragraphs.length === 0) return null
  return (
    <div className="mt-6 space-y-3 text-[16px] leading-[26px]">
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  )
}
