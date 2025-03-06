class BubbleChart {
    constructor(config) {
        // config: { container, dataPath, margin }
        this.container = config.container;
        this.dataPath = config.dataPath;
        this.margin = config.margin || 50;
    }

    render() {
        // Remove any existing SVG
        d3.select(this.container).select("svg").remove();

        // Dimensions
        const containerEl = document.querySelector(this.container);
        const width = containerEl.clientWidth;
        const height = containerEl.clientHeight;

        // Create SVG
        const svg = d3
            .select(this.container)
            .append("svg")
            .attr("width", width)
            .attr("height", height);

        // Tooltip
        const tooltip = d3.select("#tooltip");

        console.log("BubbleChart render() called!");
        // Load data
        d3.csv(this.dataPath).then((data) => {
            console.log("Data loaded for bubble chart:", data);
            // Filter
            data = data.filter((d) => +d.chart_days >= 7);
            data = data.slice(0, 100);

            // Convert numeric
            data.forEach((d, i) => {
                if (!d.id) d.id = i;
                d.best_date_decimal = +d.best_date_decimal;
                d.chart_days = +d.chart_days;
                d.total_streams = +d.total_streams;
                d.release_year = d.release_date
                    ? new Date(d.release_date).getFullYear()
                    : "Unknown";
            });

            // Count categories
            const soloCount = data.filter((d) => d.song_type === "Solo").length;
            const collabCount = data.filter(
                (d) => d.song_type === "Collaboration"
            ).length;
            const total = soloCount + collabCount;
            const boundary = (soloCount / total) * height;

            // xScale
            const xExtent = d3.extent(data, (d) => d.best_date_decimal);
            const xScale = d3
                .scaleLinear()
                .domain(xExtent)
                .range([this.margin, width - this.margin]);

            // radiusScale
            const rExtent = d3.extent(data, (d) => d.total_streams);
            const radiusScale = d3.scaleSqrt().domain(rExtent).range([3, 20]);

            // colorScale
            const colorScale = d3
                .scaleOrdinal()
                .domain(["Solo", "Collaboration"])
                .range(["#FF6961", "#77DD77"]);

            // Randomize initial positions
            data.forEach((d) => {
                if (d.song_type === "Solo") {
                    d.x = Math.random() * width;
                    d.y = Math.random() * boundary;
                } else {
                    d.x = Math.random() * width;
                    d.y = boundary + Math.random() * (height - boundary);
                }
            });

            // Force simulation
            const simulation = d3
                .forceSimulation(data)
                .alpha(1)
                .alphaMin(0.001)
                .alphaDecay(0.02)
                .velocityDecay(0.2)
                .force(
                    "x",
                    d3.forceX((d) => xScale(d.best_date_decimal)).strength(0.3)
                )
                .force("y", d3.forceY(height / 2).strength(0.05))
                .force(
                    "collide",
                    d3
                        .forceCollide((d) => radiusScale(d.total_streams))
                        .strength(0.9)
                        .iterations(3)
                )
                .force(
                    "xBoundary",
                    xBoundaryForce(
                        this.margin,
                        width - this.margin,
                        radiusScale
                    )
                );

            // Circles
            const circles = svg
                .selectAll(".bubble")
                .data(data)
                .join("circle")
                .attr("class", "bubble")
                .attr("r", (d) => radiusScale(d.total_streams))
                .attr("fill", (d) => colorScale(d.song_type))
                .attr("cx", (d) => d.x)
                .attr("cy", (d) => d.y)
                .attr("stroke", "#fff")
                .attr("stroke-width", 1)
                .on("mouseover", (event, d) => {
                    tooltip
                        .style("opacity", 1)
                        .html(
                            `<strong>${d.song_name}</strong><br/>${d.Artist} [${d.release_year}]<br/>#${d.chart_days} days in Top 200`
                        );
                })
                .on("mousemove", (event) => {
                    tooltip
                        .style("left", event.pageX + 10 + "px")
                        .style("top", event.pageY + 10 + "px");
                })
                .on("mouseout", () => {
                    tooltip.style("opacity", 0);
                });

            simulation.on("tick", () => {
                circles.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
            });

            // Immediately re-group by song_type
            simulation
                .force(
                    "x",
                    d3.forceX((d) => xScale(d.best_date_decimal)).strength(0.3)
                )
                .force(
                    "y",
                    d3
                        .forceY((d) =>
                            d.song_type === "Solo"
                                ? height * 0.35
                                : height * 0.65
                        )
                        .strength(1)
                )
                .force(
                    "collide",
                    d3
                        .forceCollide((d) => radiusScale(d.total_streams))
                        .strength(1)
                        .iterations(10)
                )
                .alpha(1)
                .restart();

            simulation.on("tick", () => {
                circles.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
            });
        });
    }
}

// xBoundaryForce
function xBoundaryForce(minX, maxX, radiusScale) {
    let nodes;
    function force(alpha) {
        for (let i = 0; i < nodes.length; i++) {
            const d = nodes[i];
            const r = radiusScale(d.total_streams);
            if (d.x < minX + r) d.x = minX + r;
            else if (d.x > maxX - r) d.x = maxX - r;
        }
    }
    force.initialize = function (_nodes) {
        nodes = _nodes;
    };
    return force;
}

window.BubbleChart = BubbleChart;
