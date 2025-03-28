// src/app/page.tsx
import Link from 'next/link'; // Import Link for navigation
import Image from 'next/image'; // Keep Image if you want logos/icons

export default function Home() {
  return (
    <div className="text-center"> {/* Center align content */}
      <h1 className="text-4xl font-bold mb-4 text-blue-800">
        Unlock Insights on 500+ Canadian Gold & Silver Miners
      </h1>
      <p className="text-lg text-gray-700 mb-8">
        Access detailed data, visualizations, and customizable tools to analyze the precious metals sector.
      </p>

      {/* Feature Highlights Section */}
      <div className="grid md:grid-cols-3 gap-6 mb-12">
        <div className="border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="text-xl font-semibold mb-2 text-blue-700">Detailed Data Table</h3>
          <p className="text-gray-600">
            Explore, sort, and filter data across hundreds of companies, including financials, reserves, and production metrics.
          </p>
        </div>
        <div className="border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="text-xl font-semibold mb-2 text-blue-700">Interactive Heatmap</h3>
          <p className="text-gray-600">
            Visualize companies based on customizable axes like market cap, resource size, or valuation metrics.
          </p>
        </div>
        <div className="border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="text-xl font-semibold mb-2 text-blue-700">Personalized Scoring</h3>
          <p className="text-gray-600">
            Weight factors that matter most to you and rank companies based on your unique investment criteria.
          </p>
        </div>
      </div>

      {/* Call to Action */}
      <div className="space-x-4">
        <Link
          href="/companies"
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors text-lg"
        >
          Explore Companies
        </Link>
        <Link
          href="/signup" // Link to signup page (we'll create this)
          className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-6 rounded-lg transition-colors text-lg"
        >
          Sign Up (Free Tier)
        </Link>
      </div>

      {/* Optional: Add a relevant image/graphic */}
      {/* <div className="mt-10">
        <Image src="/path/to/your/graphic.svg" alt="Mining analysis graphic" width={500} height={300} />
      </div> */}
    </div>
  );
}