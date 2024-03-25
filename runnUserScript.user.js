// ==UserScript==
// @name         RunnTimesheetUserscript
// @namespace    https://github.com/GiganticPlayground/RunnTimesheetUserscript
// @version      0.1
// @description  A userscript that adds functionality to Runn.io timesheet view
// @author       Matthew Morey
// @license      MIT
// @icon         https://giganticplayground.com/wp-content/uploads/2023/09/cropped-gp_favicon-180x180.png
// @homepage     https://github.com/GiganticPlayground/RunnTimesheetUserscript
// @supportURL   https://github.com/GiganticPlayground/RunnTimesheetUserscript/issues
// @updateURL    https://raw.githubusercontent.com/GiganticPlayground/RunnTimesheetUserscript/main/runnUserScript.user.js
// @downloadURL  https://raw.githubusercontent.com/GiganticPlayground/RunnTimesheetUserscript/main/runnUserScript.user.js
// @match        https://app.runn.io/timesheets*
// @grant        GM_info
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  "use strict";

  // Function to ask for ClickUp Team ID
  function askForClickUpTeamID() {
    let clickUpTeamID = GM_getValue("clickUpTeamID", null);
    if (!clickUpTeamID) {
      clickUpTeamID = window.prompt("Please enter your ClickUp Team ID:", "");
      if (clickUpTeamID) {
        GM_setValue("clickUpTeamID", clickUpTeamID);
      }
    }
    return clickUpTeamID;
  }

  // Function to ask for ClickUp API Token
  function askForClickUpAPIToken() {
    let clickUpAPIToken = GM_getValue("clickUpAPIToken", null);
    if (!clickUpAPIToken) {
      clickUpAPIToken = window.prompt(
        "Please enter your ClickUp API Token:",
        ""
      );
      if (clickUpAPIToken) {
        GM_setValue("clickUpAPIToken", clickUpAPIToken);
      }
    }
    return clickUpAPIToken;
  }

  // Function to ask for Runn API Token
  function askForRunnAPIToken() {
    let runnAPIToken = GM_getValue("runnAPIToken", null);
    if (!runnAPIToken) {
      runnAPIToken = window.prompt("Please enter your Runn API Token:", "");
      if (runnAPIToken) {
        GM_setValue("runnAPIToken", runnAPIToken);
      }
    }
    return runnAPIToken;
  }

  // Call the functions to get Team ID and API Token
  const clickUpTeamID = askForClickUpTeamID();
  const clickUpAPIToken = askForClickUpAPIToken();
  const runnAPIToken = askForRunnAPIToken();

  // Use the teamID and apiToken for your script's logic
  console.log("Team ID:", clickUpTeamID);
  console.log("API Token:", clickUpAPIToken);
  console.log("Runn API Token:", runnAPIToken);

  // Wait for the "Edit Timesheet" button and set up an observer for click events
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((addedNode) => {
        if (
          addedNode.nodeType === 1 &&
          addedNode.textContent.includes("Edit Timesheet")
        ) {
          addedNode.addEventListener("click", () => {
            enableGPPopOver();
          });
        } else if (
          addedNode.nodeType === 1 &&
          (addedNode.textContent.includes("Cancel") ||
            addedNode.textContent.includes("Save"))
        ) {
          addedNode.addEventListener("click", () => {
            removeGPPopOver();
          });
        }
      });
    });
  });

  // Observe the document body for added elements
  // this will catch the "Edit Timesheet" button when it is added to the DOM
  observer.observe(document.body, { childList: true, subtree: true });

  // Function to return an array of date strings for the current work week (Monday to Friday)
  function getWorkWeekDates() {
    const currentDate = new Date();
    // Ensure the date is set to midnight to avoid issues with daylight saving time changes
    currentDate.setHours(0, 0, 0, 0);
    const currentDayOfWeek = currentDate.getDay();
    // JavaScript's getDay() returns 0 for Sunday. This adjusts so that 1 is Monday, 2 is Tuesday, ..., 7 is Sunday.
    const normalizedCurrentDay = currentDayOfWeek === 0 ? 7 : currentDayOfWeek;
    // Calculate the distance to the previous Monday
    const distanceToMonday = 1 - normalizedCurrentDay;
    const weekDates = [];

    for (let i = 0; i < 5; i++) {
      // Only iterate for the 5 weekdays
      const date = new Date(currentDate.getTime());
      // Adjust the date to Monday of the current week, then add i days to get the rest of the workweek
      date.setDate(date.getDate() + distanceToMonday + i);
      // Format the date to YYYY-MM-DD
      const dateString = date.toISOString().split("T")[0];
      weekDates.push(dateString);
    }

    return weekDates;
  }

  // Function to return an array of project objects that contain the project ID and name and the link to the project
  // these are the projects that the user is assigned to
  function getRunnProjects() {
    const projectLinks = document.querySelectorAll('a[href*="/projects/"]');
    const projects = [];
    projectLinks.forEach((link) => {
      const fullLink = link.href;
      const projectId = fullLink.split("/").pop(); // Assumes ID is the last segment of the URL
      const projectName = link.textContent.trim(); // Project name from link text
      projects.push({
        id: projectId,
        name: projectName,
        link: fullLink,
      });
    });
    projects.forEach((project) => {
      console.log(`Project ID: ${project.id}, Name: ${project.name}`);
    });
    return projects;
  }

  // Function to fetch Runn projects using the Runn API
  // this returns all projects in the Runn account, even those the user is not assigned to
  function fetchRunnProjects() {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: "https://api.runn.io/projects",
        headers: {
          Authorization: `Bearer ${runnAPIToken}`,
          "Accept-Version": "1.0.0",
        },
        onload: function (response) {
          if (response.status >= 200 && response.status < 300) {
            const result = JSON.parse(response.responseText);

            // Log to console each project, including ID and name, and any references
            result.values.forEach((project) => {
              console.log(
                `Project ID: ${project.id}, Name: ${
                  project.name
                }, References: ${JSON.stringify(project.references)}`
              );
            });
            resolve(result.values);
          } else {
            reject(new Error("Failed to fetch Runn projects"));
          }
        },
        onerror: function (error) {
          reject(new Error("Error fetching Runn projects: " + error));
        },
      });
    });
  }

  // Function to fetch ClickUp time entries using the ClickUp API
  // this returns only the entries for the current user
  function fetchClickUpTimeEntries() {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: `https://api.clickup.com/api/v2/team/${clickUpTeamID}/time_entries`,
        headers: {
          Authorization: clickUpAPIToken,
          "Content-Type": "application/json",
        },
        onload: function (response) {
          if (response.status >= 200 && response.status < 300) {
            const result = JSON.parse(response.responseText);

            const timezoneOffset = new Date().getTimezoneOffset() * 60000; // in milliseconds

            const groupedEntries = result.data.reduce((acc, entry) => {
              // Adjust the entry.start by the browser's timezone offset before converting to a date string
              const adjustedStart = parseInt(entry.start) - timezoneOffset;
              const date = new Date(adjustedStart).toISOString().split("T")[0];
              const key = `${entry.task_location.list_id}_${date}`;

              if (!acc[key]) {
                acc[key] = {
                  listId: entry.task_location.list_id,
                  date: date,
                  duration: 0,
                  taskNames: new Set(),
                };
              }

              acc[key].duration += parseInt(entry.duration) / (3600 * 1000);
              acc[key].taskNames.add(entry.task.name);

              return acc;
            }, {});

            const timeEntries = Object.values(groupedEntries).map((entry) => ({
              listId: entry.listId,
              date: entry.date,
              duration: Math.round(entry.duration * 100) / 100,
              taskName: Array.from(entry.taskNames).join(", "),
            }));

            // Log to console each time entry
            timeEntries.forEach((entry) => {
              console.log(
                `List ID: ${entry.listId}, Date: ${entry.date}, Duration: ${entry.duration} hours, Task: ${entry.taskName}`
              );
            });

            resolve(timeEntries);
          } else {
            reject(new Error("Failed to fetch ClickUp time entries"));
          }
        },
        onerror: function (error) {
          reject(new Error("Error fetching ClickUp time entries: " + error));
        },
      });
    });
  } // End of fetchClickUpTimeEntries

  function createPopOver() {
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.bottom = "10px";
    container.style.left = "10px";
    container.style.zIndex = "10000";
    container.style.backgroundColor = "rgb(168, 211, 222)"; // blue=rgb(168, 211, 222) | orange=rgb(217, 83, 55)
    container.style.padding = "20px";
    container.style.color = "white";
    container.id = "gpPopOver";

    const headerContainer = document.createElement("div");
    headerContainer.style.display = "flex";
    headerContainer.style.alignItems = "flex-start"; // Align items at the start of the container vertically
    headerContainer.style.justifyContent = "flex-start"; // Align items to the start horizontally
    headerContainer.style.marginBottom = "10px"; // Space between this section and the next

    // Create and add the logo at the top of the div
    const logo = document.createElement("img");
    logo.src =
      "https://giganticplayground.com/wp-content/uploads/2023/09/cropped-gp_favicon-180x180.png"; // Replace with the actual URL to your logo
    logo.style.width = "90px"; // Set as desired
    logo.style.height = "auto";
    logo.style.display = "block";
    logo.style.marginBottom = "10px"; // Space between the logo and the next element
    headerContainer.appendChild(logo);

    const textContainer = document.createElement("div");
    textContainer.style.display = "flex";
    textContainer.style.flexDirection = "column"; // Stack items vertically
    textContainer.style.marginLeft = "10px"; // Space between the logo and the text container

    const scriptNameElement = document.createElement("div");
    scriptNameElement.textContent = GM_info.script.name;
    scriptNameElement.style.fontWeight = "bold";
    textContainer.appendChild(scriptNameElement); // Add the script name to the text container

    const scriptVersionElement = document.createElement("div");
    scriptVersionElement.textContent = `v${GM_info.script.version}`;
    textContainer.appendChild(scriptVersionElement); // Add the script version below the name in the text container

    headerContainer.appendChild(textContainer); // Add the text container to the header container

    container.appendChild(headerContainer); // Add the header container to the main container

    // Calculate start and end dates of the current work week (Monday to Friday)
    const currentDate = new Date();
    const currentDayOfWeek = currentDate.getDay();
    const distanceToMonday = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek; // Adjust for Sunday
    const distanceToFriday = 5 - currentDayOfWeek;

    const startOfWeek = new Date(
      currentDate.getTime() + distanceToMonday * 24 * 60 * 60 * 1000
    );
    const endOfWeek = new Date(
      currentDate.getTime() + distanceToFriday * 24 * 60 * 60 * 1000
    );

    // Format dates
    const dateFormatter = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    });

    // Add Start Date label
    const startDateLabel = document.createElement("div");
    startDateLabel.innerHTML = `<b>Start Date:</b> ${dateFormatter.format(
      startOfWeek
    )}`;
    container.appendChild(startDateLabel);

    // Add End Date label
    const endDateLabel = document.createElement("div");
    endDateLabel.innerHTML = `<b>End Date:</b> ${dateFormatter.format(
      endOfWeek
    )}`;
    container.appendChild(endDateLabel);

    const userRelevantProjects = getRunnProjects();

    // Create and add the "Runn Projects:" label and project list
    const projectsLabel = document.createElement("div");
    projectsLabel.innerHTML = "<b>Runn Projects:</b> ";
    container.appendChild(projectsLabel);

    // Create a span to list projects
    const projectsList = document.createElement("span");
    projectsList.style.fontWeight = "normal";

    // Join project names into a comma-separated string
    const projectNames = userRelevantProjects
      .map((project) => project.name)
      .join(", ");
    projectsList.textContent = projectNames
      ? projectNames
      : "No projects detected.";
    projectsLabel.appendChild(projectsList);

    // Create and add the "Import ClickUp Hours" button
    const button = document.createElement("button");
    button.id = "importClickUpHoursButton";
    button.innerText = "Import ClickUp Hours";
    button.style.backgroundColor = "transparent";
    button.style.color = "white";
    button.style.border = "1px solid white";
    button.style.marginTop = "10px";
    button.onmouseover = () =>
      (button.style.backgroundColor = "rgb(217, 83, 54)");
    button.onmouseout = () => (button.style.backgroundColor = "transparent");
    container.appendChild(button);

    return {
      popOver: container,
      importClickUpHoursButton: button,
    };
  }

  // Function to hide and remove the pop-over when the user hits the save or cancel buttons
  function removeGPPopOver() {
    const popOver = document.querySelector("#gpPopOver");
    if (popOver) {
      popOver.style.display = "none";
      popOver.remove();
    }
  }

  // Function to simulate typing in an input element
  // This is used to fill the duration inputs with the ClickUp hours
  // Because this is a React SPA, we need to simulate the typing to trigger the change event
  function simulateTyping(inputElement, value) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    ).set;
    inputElement.focus();
    nativeInputValueSetter.call(inputElement, value);

    const inputEvent = new Event("input", { bubbles: true });
    const changeEvent = new Event("change", { bubbles: true });
    inputElement.dispatchEvent(inputEvent);
    inputElement.dispatchEvent(changeEvent);
    inputElement.blur(); // Optionally blur the input after changing
  }

  async function enableGPPopOver() {
    const userRelevantProjects = getRunnProjects(); // This needs to happen before the pop-over is created, haven't figured out why yet
    const { popOver, importClickUpHoursButton } = createPopOver();
    document.body.appendChild(popOver);

    importClickUpHoursButton.addEventListener("click", async () => {
      try {
        const allRunnProjects = await fetchRunnProjects();
        const clickUpTimeEntries = await fetchClickUpTimeEntries();

        // First, create a map of project names to ClickUp listIds for easy lookup.
        const projectNameToListId = allRunnProjects.reduce((acc, project) => {
          const reference = project.references.find(
            (ref) => ref.referenceName === "clickupListId"
          );
          if (reference && project.name) {
            // Split the externalId by comma and trim spaces to support multiple list IDs
            acc[project.name] = reference.externalId
              .split(",")
              .map((id) => id.trim());
          }
          return acc;
        }, {});

        // Use userRelevantProjects to establish the correct order and map to listId indices.
        const listIdToProjectIndex = userRelevantProjects.reduce(
          (acc, userProject, index) => {
            const listId = projectNameToListId[userProject.name];
            if (listId) {
              acc[listId] = index;
            }
            return acc;
          },
          {}
        );

        console.log(listIdToProjectIndex);

        const inputs = document.querySelectorAll(
          'input[data-component="Duration"]'
        );
        console.log(`Found ${inputs.length} duration inputs`);

        const datesOfWeek = getWorkWeekDates();

        clickUpTimeEntries.forEach((entry) => {
          Object.entries(listIdToProjectIndex).forEach(
            ([listId, projectIndex]) => {
              if (listId.includes(entry.listId)) {
                // Check if the entry's listId is included in the project's list of listIds
                const dateIndex = datesOfWeek.findIndex(
                  (date) => date === entry.date
                );
                if (dateIndex >= 0) {
                  // Calculate the input index, adjusting correctly for skipped inputs
                  const inputIndex = projectIndex * 6 + dateIndex;
                  console.log(`inputIndex for ${entry.date}: ${inputIndex}`);

                  if (inputIndex >= 0 && inputIndex < inputs.length) {
                    simulateTyping(
                      inputs[inputIndex],
                      Math.round(entry.duration).toString()
                    );
                  }
                }
              }
            }
          );
        });
      } catch (error) {
        console.error("Error fetching and filling ClickUp hours:", error);
      }
    });
  }
})();
