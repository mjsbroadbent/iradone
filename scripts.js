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