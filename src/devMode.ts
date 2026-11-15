/**
 * Developer mode shows build and data tools (map provider badge, Coverage, Floor plans, staff role
 * chip) that confuse usability testers. Open the app with ?dev to turn it on (remembered in this
 * browser), ?dev=0 to turn it off.
 */
function read(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('dev');
    if (q !== null) {
      if (q === '0') localStorage.removeItem('insideout.dev'); else localStorage.setItem('insideout.dev', '1');
      return q !== '0';
    }
    return localStorage.getItem('insideout.dev') === '1';
  } catch {
    return false; // storage blocked: tester view
  }
}

export const DEV_MODE = typeof window !== 'undefined' && read();
