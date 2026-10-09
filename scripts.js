// Function to format dates as "Mar 13", "Mar 14", etc.
function formatDate(date) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const day = date.getDate();
    const month = months[date.getMonth()];
    return `${month} ${day}`;
}

// Function to get the day of the week
function getDayOfWeek(date) {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[date.getDay()];
}

// Function to shuffle array randomly
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Hollywood Cinema movies (early 90s)
const hollywoodMovies = [
    "Clear and Present Danger (1994)",
    "The Shawshank Redemption (1994)",
    "Pulp Fiction (1994)",
    "Forrest Gump (1994)",
    "The Lion King (1994)",
    "Jurassic Park (1993)",
    "Schindler's List (1993)",
    "The Fugitive (1993)",
    "Groundhog Day (1993)",
    "Sleepless in Seattle (1993)",
    "The Firm (1993)",
    "Philadelphia (1993)",
    "The Nightmare Before Christmas (1993)",
    "Dazed and Confused (1993)",
    "True Romance (1993)",
    "Menace II Society (1993)",
    "The Sandlot (1993)",
    "Demolition Man (1993)",
    "Tombstone (1993)",
    "The Piano (1993)",
    "In the Line of Fire (1993)",
    "The Age of Innocence (1993)",
    "Carlito's Way (1993)",
    "What's Eating Gilbert Grape (1993)",
    "The Remains of the Day (1993)",
    "The Joy Luck Club (1993)",
    "Rudy (1993)",
    "The Secret Garden (1993)",
    "The Three Musketeers (1993)",
    "The Pelican Brief (1993)",
    "A Bronx Tale (1993)"
];

// Iradi Cinema movies (from Turkey, Russia, and Central Asia)
const iradiMovies = [
    "Yol (1982) Turkey",
    "Once Upon a Time in Anatolia (2011) Turkey",
    "Winter Sleep (2014) Turkey",
    "The Bandit (1996) Turkey",
    "Mustang (2015) Turkey",
    "The Mirror (1975) Russia",
    "Stalker (1979) Russia",
    "Leviathan (2014) Russia",
    "Brother (1997) Russia",
    "The Return (2003) Russia",
    "Tulpan (2008) Kazakhstan",
    "The Gift to Stalin (2008) Kazakhstan",
    "Kelin (2009) Kazakhstan",
    "Shal (2012) Kazakhstan",
    "The Road to Mother (2016) Kazakhstan",
    "Kurmanjan Datka: Queen of the Mountains (2014) Kyrgyzstan",
    "The Light Thief (2010) Kyrgyzstan",
    "Heavenly Nomadic (2015) Kyrgyzstan",
    "Salam, New York (2013) Kyrgyzstan",
    "The Father (2021) Kyrgyzstan",
    "The Deserted Station (2002) Iran",
    "A Separation (2011) Iran",
    "The Salesman (2016) Iran",
    "About Elly (2009) Iran",
    "The White Balloon (1995) Iran",
    "Zalmax's Dominion (1975) Irad",
    "Rise of Glory (1979) Irad",
    "Desert Blue (1981) Irad",
    "Desert Sun's Rebellion (1979) Irad",
    "Visions of Irad (1984) Irad",
    "Zarina (1970) Irad",
    "Guide of the Sands (1981) Irad",
    "Journey of the Steppes (1988) Irad",
    "Vengeance Rider (1986) Irad"
];

// Function to update tab labels with real dates and day names
function updateTabDates() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dayAfter = new Date(today);
    dayAfter.setDate(today.getDate() + 2);

    // Update tab labels in the format "Today (Mar 15)", "Sunday (Mar 16)", "Monday (Mar 17)"
    document.getElementById("todayTab").textContent = `Today (${formatDate(today)})`;
    document.getElementById("tomorrowTab").textContent = `${getDayOfWeek(tomorrow)} (${formatDate(tomorrow)})`;
    document.getElementById("dayAfterTab").textContent = `${getDayOfWeek(dayAfter)} (${formatDate(dayAfter)})`;
}

// Function to handle tab switching
function openTab(evt, tabName) {
    const tabcontent = document.getElementsByClassName("tabcontent");
    for (let i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }

    const tablinks = document.getElementsByClassName("tablink");
    for (let i = 0; i < tablinks.length; i++) {
        tablinks[i].classList.remove("active");
    }

    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.classList.add("active");

    // Update the schedule when switching tabs
    updateScheduleForTab(tabName);
}

// Function to assign movies to the "Hollywood Cinema" and "Iradi Cinema" time slots
function assignMoviesToTabs(tabId) {
    // Shuffle the movies to randomize their order
    const shuffledHollywoodMovies = shuffleArray(hollywoodMovies);
    const shuffledIradiMovies = shuffleArray(iradiMovies);

    // Update Hollywood Cinema and Iradi Cinema for the given tab
    const hollywoodElement = document.querySelector(`#${tabId} .hollywood-cinema`);
    const iradiElement = document.querySelector(`#${tabId} .iradi-cinema`);

    if (hollywoodElement && iradiElement) {
        hollywoodElement.textContent = `Hollywood Cinema: ${shuffledHollywoodMovies[0]}`;
        iradiElement.textContent = `Iradi Cinema: ${shuffledIradiMovies[0]}`;
    }
}

// Function to generate the schedule based on the day
function generateSchedule(date) {
    const dayOfWeek = getDayOfWeek(date);
    const isWeekend = dayOfWeek === "Saturday" || dayOfWeek === "Sunday";
    const isThursday = dayOfWeek === "Thursday";

    // Define the schedule template
    const schedule = [
        { time: "6:00 AM", program: "Morning News", description: "Daily news updates covering local and international events." },
        { time: "6:30 AM", program: "OneBreakfast with Anara", description: "A light-hearted morning show with music, interviews, and lifestyle tips." },
        { time: "7:30 AM", program: "Follow the White Rider", description: "Educational and entertaining Christian program for kids, including cartoons and learning shows." },
        { time: "8:30 AM", program: "Koyon teşigi (The Rabbit Hole)", description: "An Iradi language children's program featuring music, stories, and crafts." },
        { time: "9:30 AM", program: "The Star Leads the Way", description: "A documentary series exploring the history and traditions of Irad." },
        { time: "10:30 AM", program: "Talk Show: 'Voices of Janyl'", description: "Talk show featuring discussions on current events, social and religious issues." },
        { time: "11:30 AM", program: isWeekend ? "Baking with Zarina" : "Cook with Ayyub", description: isWeekend ? "Baking program featuring traditional recipes and culinary techniques." : "A cooking show featuring traditional recipes and culinary techniques." },
        { time: "12:00 PM", program: "Midday News", description: "Comprehensive news update covering politics, economy, and culture." },
        { time: "12:30 PM", program: "İçkenge attı jetelep (Lead a Horse to Drink)", description: "A popular Iradi language drama series about family." },
        { time: "1:30 PM", program: "Sports Highlights", description: "A recap of the latest sports events, including football, horse racing, and more." },
        { time: "2:00 PM", program: "Hollywood Cinema", description: "A movie slot showing classic Hollywood films.", className: "hollywood-cinema" },
        { time: "4:00 PM", program: "Afternoon News", description: "A brief news update with a focus on stories and community events that matter to you." },
        { time: "4:30 PM", program: "Music Hour", description: "A program featuring contemporary music from Irad and around the world." },
        { time: "5:30 PM", program: "Foal Zone", description: "Comedy show for teenagers, covering topics like education, horses, and careers." },
        { time: "6:30 PM", program: "Evening News", description: "In-depth news coverage with analysis and expert opinions." },
        { time: "7:00 PM", program: "OneTruth", description: "IradOne's premier journalism program highlighting local issues." },
        { time: "8:00 PM", program: isThursday ? "Friends" : "In the World of Animals", description: isThursday ? "Very high-quality comedy series, featuring American actors and stories." : "Russian television program dedicated to zoology and wildlife research." },
        { time: "9:00 PM", program: isWeekend ? "Sports Live: Ulak Tartysh" : "Sports Live: Horse Racing", description: isWeekend ? "Live coverage of ulak tartysh matches." : "Live coverage of horse races." },
        { time: "11:00 PM", program: "Late Night News", description: "Summary of the day's top stories and events." },
        { time: "11:30 PM", program: "Iradi Cinema", description: "Late-night movie slot featuring Iradi and international films.", className: "iradi-cinema" },
        { time: "1:30 AM", program: "The Tonight Show with Jay Leno", description: "Late-night talk show from America." },
        { time: "2:30 AM", program: "Classic Iradi Music", description: "A program featuring traditional Iradi music and folk songs." },
        { time: "3:30 AM", program: "Sign Off", description: "The channel signs off for the night with the national anthem." }
    ];

    return schedule;
}

// Function to create a schedule table for a given tab
function createScheduleTable(tabId) {
    const scheduleSection = document.getElementById("schedule");

    // Create a new schedule table for the tab
    const tabContent = document.createElement("div");
    tabContent.id = tabId;
    tabContent.className = "tabcontent";
    tabContent.style.display = "none"; // Hide by default

    const scheduleTable = document.createElement("div");
    scheduleTable.className = "schedule-table";

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");

    // Create table header
    const headerRow = document.createElement("tr");
    headerRow.innerHTML = `
        <th>Time</th>
        <th>Program</th>
        <th>Description</th>
    `;
    thead.appendChild(headerRow);

    // Append thead and tbody to the table
    table.appendChild(thead);
    table.appendChild(tbody);

    // Append table to the schedule table div
    scheduleTable.appendChild(table);

    // Append schedule table to the tab content
    tabContent.appendChild(scheduleTable);

    // Append the tab content to the schedule section
    scheduleSection.appendChild(tabContent);
}

// Function to update the schedule for a specific tab
function updateScheduleForTab(tabId) {
    const today = new Date();
    let date;

    if (tabId === "today") {
        date = today;
    } else if (tabId === "tomorrow") {
        date = new Date(today);
        date.setDate(today.getDate() + 1);
    } else if (tabId === "dayAfter") {
        date = new Date(today);
        date.setDate(today.getDate() + 2);
    }

    const schedule = generateSchedule(date);
    const tbody = document.querySelector(`#${tabId} tbody`);
    tbody.innerHTML = ""; // Clear existing rows

    // Populate the schedule table
    schedule.forEach(item => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${item.time}</td>
            <td${item.className ? ` class="${item.className}"` : ""}>${item.program}</td>
            <td>${item.description}</td>
        `;
        tbody.appendChild(row);
    });

    // Assign movies to the "Hollywood Cinema" and "Iradi Cinema" time slots
    assignMoviesToTabs(tabId);
}

// Initialize the tabs and add event listeners
document.addEventListener('DOMContentLoaded', () => {
    console.log('IradOne Website Loaded');

    // Create schedule tables for "tomorrow" and "dayAfter"
    createScheduleTable("tomorrow");
    createScheduleTable("dayAfter");

    // Update the tab dates
    updateTabDates();

    // Add event listeners to the tabs
    const tablinks = document.getElementsByClassName("tablink");
    for (let i = 0; i < tablinks.length; i++) {
        tablinks[i].addEventListener("click", function (event) {
            const tabName = this.getAttribute("onclick").split("'")[1];
            openTab(event, tabName);
        });
    }

    // Initialize the schedule for the default tab (Today)
    updateScheduleForTab("today");
});

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