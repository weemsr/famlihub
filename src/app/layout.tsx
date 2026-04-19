import type { Metadata, Viewport } from 'next';
import './globals.css';
import BottomNav from '@/components/BottomNav';
import AuthProvider from '@/components/AuthProvider';

export const metadata: Metadata = {
  title: 'FamLi Hub',
  description: 'Shared notes, todos, recipes, and groceries.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'FamLi Hub',
  },
  icons: {
    icon: '/logo3.png',
    apple: '/logo3.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F7F7' },
    { media: '(prefers-color-scheme: dark)', color: '#111215' },
  ],
};

// No-flash theme bootstrap. Runs before React hydrates so there is never a
// light-mode flash for users who chose dark (or whose system prefers it).
const noFlashThemeScript = `
(function(){
  try {
    var t = localStorage.getItem('famli.theme');
    if (t === 'dark' || t === 'light') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashThemeScript }} />
      </head>
      <body>
        <AuthProvider>
          <main className="container">
            {children}
          </main>
          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
