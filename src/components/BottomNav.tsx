"use client";

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, CheckSquare, ShoppingCart, Utensils, PenTool, Package, Calendar, ChefHat, Wrench, CreditCard } from 'lucide-react';

export default function BottomNav() {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  // Ten destinations don't fit a phone, so the bar scrolls horizontally — but
  // that left later tabs (Calendar is 8th) off-screen with no hint they exist.
  // Pull the current tab into view so you can always see where you are.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [pathname]);

  const navItems = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'To-do', href: '/todos', icon: CheckSquare },
    { name: 'Groceries', href: '/groceries', icon: ShoppingCart },
    { name: 'Meals', href: '/meals', icon: Utensils },
    { name: 'Recipes', href: '/recipes', icon: ChefHat },
    { name: 'Notes', href: '/notes', icon: PenTool },
    { name: 'Pantry', href: '/inventory', icon: Package },
    { name: 'Calendar', href: '/calendar', icon: Calendar },
    { name: 'Credit Card', href: '/credit-cards', icon: CreditCard },
    { name: 'Upkeep', href: '/maintenance', icon: Wrench },
  ];

  return (
    <nav className="bottom-nav">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
        
        return (
          <Link
            key={item.href}
            href={item.href}
            ref={isActive ? activeRef : undefined}
            aria-current={isActive ? 'page' : undefined}
            className={`nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={24} className="nav-icon" />
            <span>{item.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
