// src/app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css' // Ensure Tailwind via globals.css
import Navbar from '@/components/Navbar' // Placeholder import
import Footer from '@/components/Footer' // Placeholder import

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'CAN Gold & Silver Mining Analysis', // Adjust title
  description: 'Data platform for Canadian mining companies', // Adjust description
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-white flex flex-col min-h-screen`}>
        <Navbar /> {/* Add Navbar */}
        <main className="flex-grow container mx-auto px-4 py-8"> {/* Main content area */}
          {children}
        </main>
        <Footer /> {/* Add Footer */}
      </body>
    </html>
  )
}