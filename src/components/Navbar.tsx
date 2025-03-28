// src/components/Navbar.tsx
import Link from 'next/link';

export default function Navbar() {
  return (
    <nav className="bg-blue-600 text-white p-4 shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/" className="text-xl font-bold">
          Mining Analyser {/* Or your App Name */}
        </Link>
        <div className="space-x-4">
          <Link href="/" className="hover:text-blue-200">
            Home
          </Link>
          <Link href="/companies" className="hover:text-blue-200">
            Companies
          </Link>
          <Link href="/heatmap" className="hover:text-blue-200">
            Heatmap
          </Link>
          <Link href="/pricing" className="hover:text-blue-200">
            Pricing
          </Link>
          {/* Auth links will go here later */}
          <Link href="/login" className="hover:text-blue-200">
            Login
          </Link>
        </div>
      </div>
    </nav>
  );
}