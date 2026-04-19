"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, CheckSquare, ShoppingCart, Utensils, PenTool, Package, Calendar, ChefHat, Wrench } from 'lucide-react';

export default function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'To-do', href: '/todos', icon: CheckSquare },
    { name: 'Groceries', href: '/groceries', icon: ShoppingCart },
    { name: 'Meals', href: '/meals', icon: Utensils },
    { name: 'Recipes', href: '/recipes', icon: ChefHat },
    { name: 'Notes', href: '/notes', icon: PenTool },
    { name: 'Pantry', href: '/inventory', icon: Package },
    { name: 'Calendar', href: '/calendar', icon: Calendar },
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
            className={`nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={28} className="nav-icon" />
            <span>{item.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
