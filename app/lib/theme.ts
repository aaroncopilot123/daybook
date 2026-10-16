export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "daybook.theme";

// Run in the document head before content can paint, independently of hydration.
export const themeInitScript = `(()=>{let theme="dark";try{if(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})==="light")theme="light"}catch{}document.documentElement.dataset.theme=theme})()`;
