document.addEventListener("DOMContentLoaded", () => {
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
            console.log(`Leaving section: ${origin.index}`);

            // Remove the graph when leaving the "network-graph" section
            if (origin.item.id === "network-graph") {
                console.log("Removing existing graph...");
                d3.select("#artist-network-container").select("svg").remove();
            }

            // if (origin.item.id === "bubble-chart") {
            //     console.log("Cleaning up bubble chart...");
            //     d3.select("#chart").select("svg").remove();
            // }
        },

        // Handles initialization when entering a section
        afterLoad: function (origin, destination, direction) {
            console.log(`Entering section: ${destination.index}`);

            //! INCLUDE REFERENCES TO YOUR PAGES HERE AND CALL LOAD WITH THE APPROPRIATE FORMATTING YOU WROTE
            //  TODO: Work in progress. Unsure if this generalizes well enough.
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
                        const bubbleChart = new BubbleChart({
                            container: "#chart",
                            dataPath: "data/intro_genre/vis1.csv",
                        });
                        bubbleChart.render();
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
                        const barChart = new BarChart({
                            dataPath: "data/intro_genre/vis2.csv",
                            container: "#barChart",
                            width: 1000,
                            height: 600,
                        });
                        barChart.render();
                    }
                );
            }
        },
    });
});
