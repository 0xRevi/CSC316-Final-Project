document.addEventListener("DOMContentLoaded", () => {
    // global color variables
    window.SOLO_COLOR = "#FF6961";
    // window.COLLAB_COLOR = "#77DD77";
    // window.SOLO_COLOR = "#ff5e7c";
    window.COLLAB_COLOR = "#4cc764";

    async function loadComponent(id, file, scriptFiles = [], callback = null) {
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
        autoScrolling: true,
        navigation: true,
        scrollHorizontally: true,
        // Handles cleanup when leaving a section
        onLeave: function (origin, destination, direction) {
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
                }

              }

            // if (origin.item.id === "bubble-chart") {
            //     console.log("Cleaning up bubble chart...");
            //     d3.select("#chart").select("svg").remove();
            // }
            if (origin.item.id === "scrolly-chart") {
                console.log("Cleaning up bar chart race...");
                // d3.select("#visualization-container").select("svg").remove();
                window.timeControllerInstance.handlePageLeave();
            }
        },

        // Handles initialization when entering a section
        afterLoad: function (origin, destination, direction) {
            console.log(`Entering section: ${destination.index}`);

            //! INCLUDE REFERENCES TO YOUR PAGES HERE AND CALL LOAD WITH THE APPROPRIATE FORMATTING YOU WROTE
            //  TODO: Work in progress. Unsure if this generalizes well enough.

            if (destination.item.id === "intro") {
                loadScript("js/introAnimation.js")
                    .then(() => {
                        if (typeof initIntroAnimation === "function") {
                            initIntroAnimation();
                        } else {
                        }
                    });
            }

            if (destination.item.id === "network-graph") {
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
            if (destination.item.id === "scrolly-chart") {
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

            if (destination.item.id === "bubble-chart") {
                console.log("Loading the bubble chart...");
                loadComponent(
                    "chart",
                    "components/bubble-chart.html",
                    ["js/bubbleChart.js"],
                    () => {
                        if (!window.bubbleChartInstance) {
                            console.log("Creating new bubble chart instance");
                            window.bubbleChartInstance = new BubbleChart({
                                // container: "#chart",
                                parentElement: "chart",
                                dataPath: "data/intro_genre/vis1.csv",
                            });
                        } else {
                            console.log("Using existing bubble chart instance");
                        }
                    }
                );
            }

            if (destination.item.id === "bar-chart") {
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
