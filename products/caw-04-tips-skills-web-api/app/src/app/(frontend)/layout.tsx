import React from 'react'

import './globals.css'

export const metadata = {
  description:
    'Internal AI tips, skills, and news — knowledge + community platform (CAW-04).',
  title: 'CAW-04 — AI Tips & Skills',
}

export default function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
