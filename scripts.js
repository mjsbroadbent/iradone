// IradOne site scripts. The TV schedule lives in schedule.js (data in schedule.json).

// Get all links with the class .adblock-warning
const adblockLinks = document.querySelectorAll('.adblock-warning');
const popover = document.getElementById('adblock-popover');
const closeButton = document.getElementById('close-popover');
const overlay = document.createElement('div');
overlay.className = 'popover-overlay';

// Function to show the popover
function showPopover() {
  popover.style.display = 'block';
  overlay.style.display = 'block';
  document.body.appendChild(overlay);
}

// Function to hide the popover
function hidePopover() {
  popover.style.display = 'none';
  overlay.style.display = 'none';
}

// Add event listeners to all links with the class .adblock-warning
adblockLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault(); // Prevent the link from navigating
    showPopover();
  });
});

// Hide the popover when the close button is clicked
closeButton.addEventListener('click', hidePopover);

// Hide the popover when clicking outside of it
overlay.addEventListener('click', hidePopover);
// Lead stories slideshow (slides are written by newsroom/build.py)
(function () {
  const box = document.querySelector('.lead-stories');
  if (!box) return;
  const slides = Array.from(box.querySelectorAll('.lead-slide'));
  const dots = box.querySelector('.lead-dots');
  if (slides.length < 2) return;
  let current = 0;
  let timer = null;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const buttons = slides.map((slide, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', 'Story ' + (i + 1) + ' of ' + slides.length);
    b.addEventListener('click', () => { show(i); restart(); });
    dots.appendChild(b);
    return b;
  });

  function show(i) {
    current = (i + slides.length) % slides.length;
    slides.forEach((s, j) => {
      const on = j === current;
      s.classList.toggle('active', on);
      s.setAttribute('aria-hidden', on ? 'false' : 'true');
      s.tabIndex = on ? 0 : -1;
      buttons[j].setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function restart() {
    clearInterval(timer);
    if (!reduceMotion) timer = setInterval(() => show(current + 1), 7000);
  }

  box.addEventListener('mouseenter', () => clearInterval(timer));
  box.addEventListener('mouseleave', restart);
  box.addEventListener('focusin', () => clearInterval(timer));
  box.addEventListener('focusout', restart);
  show(0);
  restart();
})();
