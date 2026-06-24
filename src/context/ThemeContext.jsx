import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    const loadTheme = async () => {
      if (window.api) {
        try {
          const saved = await window.api.getSetting('theme', 'dark');
          if (saved) {
            setTheme(saved);
            document.documentElement.classList.toggle('light-mode', saved === 'light');
          }
        } catch (e) {
          console.error('Failed to load theme from settings store:', e);
        }
      } else {
        const saved = localStorage.getItem('solas-theme');
        if (saved) {
          setTheme(saved);
          document.documentElement.classList.toggle('light-mode', saved === 'light');
        }
      }
    };
    loadTheme();
  }, []);

  const changeTheme = async (newTheme) => {
    setTheme(newTheme);
    document.documentElement.classList.toggle('light-mode', newTheme === 'light');
    if (window.api) {
      try {
        await window.api.setSetting('theme', newTheme);
      } catch (e) {
        console.error('Failed to save theme in settings store:', e);
      }
    } else {
      localStorage.setItem('solas-theme', newTheme);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme: changeTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
