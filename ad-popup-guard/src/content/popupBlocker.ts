export function blockPopups() {
  window.alert = () => { };
  window.confirm = () => false;
  window.open = () => null;


  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      m.addedNodes.forEach(node => {
        if (!(node instanceof HTMLElement)) return;


        const style = window.getComputedStyle(node);
        if (
          style.position === 'fixed' &&
          Number(style.zIndex) > 1000
        ) {
          node.remove();
        }
      });
    }
  });


  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}