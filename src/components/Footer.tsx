// src/components/Footer.tsx
export default function Footer() {
  const currentYear = new Date().getFullYear();
  return (
    <footer className="mt-auto bg-gray-100 border-t border-gray-300 p-4 text-center">
      <p className="text-xs text-gray-600">
        © {currentYear} YourCompanyName. All rights reserved. {/* Update Company Name */}
      </p>
      <p className="text-xs text-gray-500 mt-1">
        Disclaimer: This app provides data only, not investment advice. Users
        assume all risks associated with the use of this information. Verify
        data independently before making any decisions.
      </p>
    </footer>
  );
}