document.addEventListener("DOMContentLoaded", () => {
    // Global Color configruations
    //! Required for color references across beeswarm, bar chart race, and artist network
    const rootStyles = getComputedStyle(document.documentElement);
    window.SOLO_COLOR = rootStyles.getPropertyValue('--SOLO_COLOR').trim();
    window.COLLAB_COLOR = rootStyles.getPropertyValue('--COLLAB_COLOR').trim();
    window.SELECTED_NODE_COLOR = rootStyles.getPropertyValue('--SELECTED_NODE_COLOR').trim();

    /**
     * This function fetches the HTML content from the provided file path and injects it into
     * the container identified by the given id. It prevents reloading if the component is already loaded.
     * If additional script files are specified, they are loaded sequentially.
     *
     * @async
     * @param {string} id - The id of the DOM element that will host the HTML content.
     * @param {string} file - The path of the HTML file to fetch and inject.
     * @param {Array<string>} [scriptFiles=[]] - Array of script file paths to load after the HTML content.
     * @param {Function|null} [callback=null] - Optional callback function to execute after all content and scripts are loaded.
     * @returns {Promise<void>} A promise that resolves when the component and scripts are loaded.
     */
    async function loadComponent(id, file, scriptFiles=[], callback=null) {
        const container = document.getElementById(id);
        // Prevent reloading if already loaded
        if (container.dataset.loaded === "true") {
            console.log(`Component ${id} already loaded, skipping...`);
            if (callback && typeof callback === "function") callback();
            return;
        }
        try {
            // Fetch and inject the HTML content
            const response = await fetch(file);
            const content = await response.text();
            container.innerHTML = content;
            container.dataset.loaded = "true";
            // Load scripts sequentially
            for (let scriptFile of scriptFiles) {
                if (!document.querySelector(`script[src="${scriptFile}"]`)) {
                    await loadScript(scriptFile);
                }
            }
            // Execute the callback if provided
            if (callback && typeof callback === "function") {
                callback();
            }
        } catch (error) {
            console.error(`Error loading ${file}:`, error);
        }
    }

    /**
     * Asynchronously loads a JavaScript file by creating and appending a script element
     * to the document. If the script fails to load, the promise rejects with the error.
     *
     * @param {string} src - The URL or path of the JavaScript file to load.
     * @returns {Promise<void>} A promise that resolves when the script is loaded successfully.
     */
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            let script = document.createElement("script");
            script.src = src;
            script.defer = true;
            script.onload = () => {
                console.log(`${src} loaded successfully.`);
                resolve();
            };
            script.onerror = reject;
            document.body.appendChild(script);
        });
    }

    // Initialize fullPage.js with `onLeave` and `afterLoad` to handle graph state
    new fullpage("#fullpage", {
        // Parameterize fullpage interactions
        autoScrolling: true,
        navigation: true,
        scrollHorizontally: true,
        // Handles cleanup when leaving a section
        onLeave: function (origin) {
            console.log(`Leaving section: ${origin.index}, ${origin.item.id}`);
            // Remove the graph when leaving the "network-graph" section
            if (origin.item.id === "network-graph") {
                console.log("Removing existing graph...");
                //! New fix for clearing and loading data on page visits.
                const comp = document.getElementById("artist-network");
                if (comp) {
                    // Clear the inner HTML and reset the loaded flag.
                    comp.innerHTML = "";
                    comp.dataset.loaded = "false";
                    // Removes network tooltip for bleeding over to other pages.
                    d3.select("body").select("div.network-tooltip").style("opacity", 0);
                }
            }
            else if (origin.item.id === "scrolly-chart") {
                console.log("Cleaning up bar chart race...");
                window.timeControllerInstance.handlePageLeave();
            }
        },

        // Handles initialization when entering a section
        afterLoad: function (_origin, destination, _direction) {
            console.log(`Entering section: ${destination.index}`);
            //! INCLUDE REFERENCES TO YOUR PAGES HERE AND CALL LOAD WITH THE APPROPRIATE FORMATTING YOU WROTE
            if (destination.item.id === "intro") {
                loadScript("js/introAnimation.js").then(() => {
                    if (typeof initIntroAnimation === "function") {
                        initIntroAnimation();
                    } else {
                    }
                });
            }
            else if (destination.item.id === "network-graph") {
                loadComponent(
                    "artist-network",
                    "components/artist-network.html",
                    ["js/artistNetworkGraph.js"],
                    () => {
                        const artistNetwork = new ArtistNetworkGraph(
                            d3.select("#artist-network-container"),
                            { initialYear: "2024" }
                        );
                        artistNetwork.init();
                    }
                );
            }
            else if (destination.item.id === "scrolly-chart") {
                console.log("Loading bar chart race...");
                loadComponent(
                    "visualization-container",
                    "components/bar-chart.html",
                    [
                        "js/barChartRace.js",
                        "js/lineChartTimeline.js",
                        "js/timeController.js",
                        "js/main.js",
                    ]
                );
            }
            else if (destination.item.id === "bubble-chart") {
                console.log("Loading the bubble chart...");
                loadComponent(
                    "chart",
                    "components/bubble-chart.html",
                    ["js/bubbleChart.js"],
                    () => {
                        if (!window.bubbleChartInstance) {
                            console.log("Creating new bubble chart instance");
                            window.bubbleChartInstance = new BubbleChart({
                                parentElement: "chart",
                                dataPath: "data/intro_genre/vis1.csv",
                            });
                        } else {
                            console.log("Using existing bubble chart instance");
                        }
                    }
                );
            }
            else if (destination.item.id === "bar-chart") {
                console.log("Loading the bar chart...");
                loadComponent(
                    "barChart",
                    "components/genre-chart.html",
                    ["js/barChart.js"],
                    () => {
                        d3.select("#barChart").select("svg").remove(); // TODO
                        // re-rendering every time when returning to this section
                        const barChart = new BarChart({
                            dataPath: "data/intro_genre/vis2.csv",
                            container: "#barChart",
                            width: 1300,
                            height: 600,
                        });
                        barChart.render();
                    }
                );
            }
        },
    });
});