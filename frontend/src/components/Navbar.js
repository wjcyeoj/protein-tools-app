import React from 'react';

export default function Navbar() {
  return (
    <header className="border-b bg-white">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
        <div className="font-semibold">Protein Tools</div>
        <nav className="text-sm text-gray-600">
          <a href="/" className="hover:underline">Home</a>
        </nav>
      </div>
    </header>
  );
}
