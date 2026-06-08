import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LLAgents',
  description: 'Deploy editable application templates.'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
