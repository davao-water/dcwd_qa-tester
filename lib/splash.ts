// The QA Hub preloader plays once per browser session (components/app-splash.tsx). Kept outside the client component so
// the server layout can inline SPLASH_SCRIPT, which runs before the first paint.

export const SPLASH_KEY = "qa-hub:splash";
/** The class on <html> that shows the preloader (app/_styles/motion.css hides .qa-splash without it). */
export const SPLASH_ON = "qa-splash-on";

export const SPLASH_SCRIPT = `try{if(!sessionStorage.getItem(${JSON.stringify(SPLASH_KEY)}))document.documentElement.classList.add(${JSON.stringify(SPLASH_ON)})}catch(e){}`;
