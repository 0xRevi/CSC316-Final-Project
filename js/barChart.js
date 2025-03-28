class BarChart {
    constructor(config) {
        this.dataPath = config.dataPath;
        this.container = config.container;
        this.width = config.width;
        this.height = config.height;
        this.margin = config.margin || { top: 20, right: 20, bottom: 60, left: 150 };
        this.innerWidth = this.width - this.margin.left - this.margin.right;
        this.innerHeight = this.height - this.margin.top - this.margin.bottom;
        // Default to a specific year (no "all" option)
        this.selectedYear = config.selectedYear || "2024";
        this.valueType = config.valueType || "proportion"; // "proportion" or "raw"
        this.initFilters(); // Create filter controls
    }

    async loadData() {
        let raw = await d3.csv(this.dataPath);
        // Exclude rows where parent_genres is "nan"
        raw = raw.filter(
            d => d.parent_genres && d.parent_genres.trim().toLowerCase() !== "nan"
        );
        raw.forEach(d => {
            d.parent_genres = d.parent_genres.trim();
        });
        this.stableUniqueGenres = Array.from(new Set(raw.map(d => d.parent_genres)));
        return raw;
    }

    processData(data) {
        // Trim years_on_chart strings
        data.forEach(d => { d.years_on_chart = d.years_on_chart.trim(); });
        // Always filter by the selected year (no "all" option)
        data = data.filter(d => d.years_on_chart === this.selectedYear);

        // Group by parent_genres
        const genreMap = d3.group(data, d => d.parent_genres);
        const result = [];
        for (const [genre, rows] of genreMap.entries()) {
            const soloCount = rows.filter(r => r.song_type === "Solo").length;
            const collabCount = rows.filter(r => r.song_type === "Collaboration").length;
            const total = soloCount + collabCount;
            if (total > 0) {
                result.push({
                    year: this.selectedYear,
                    parent_genres: genre,
                    total,
                    soloCount,
                    collabCount,
                    soloProp: soloCount / total,
                    collabProp: collabCount / total,
                });
            }
        }
        // Sort by total descending and pick top 10
        result.sort((a, b) => d3.descending(a.total, b.total));
        return result.slice(0, 10);
    }

    render() {

        // Update filter UI if it already exists.
        const container = document.querySelector(this.container);
        const controlsDiv = container.querySelector(".chart-controls");
        if (controlsDiv) {
            const yearSlider = controlsDiv.querySelector(".year-slider");
            const yearValue = controlsDiv.querySelector(".year-value");
            const viewSelector = controlsDiv.querySelector(".view-selector");
            if (yearSlider) {
                yearSlider.value = this.selectedYear;
            }
            if (yearValue) {
                yearValue.textContent = this.selectedYear;
            }
            if (viewSelector) {
                viewSelector.value = this.valueType;
            }
        }

        // Ensure a tooltip element exists.
        if (d3.select("#tooltip").empty()) {
            d3.select("body")
                .append("div")
                .attr("id", "tooltip")
                .attr("class", "tooltip")
                .style("opacity", 0);
        }

        this.loadData().then(rawData => {
            const processed = this.processData(rawData);
            let data = processed.slice();
            if (this.valueType === "raw") {
                data.sort((a, b) => d3.descending(a.total, b.total));
            } else {
                data.sort((a, b) => d3.descending(a.collabProp, b.collabProp));
            }

            // Define a fixed array of colours and a scale for genres.
            const fixedColors = [
                "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728",
                "#9467bd", "#8c564b", "#e377c2", "#7f7f7f",
                "#bcbd22", "#17becf"
            ];
            const colorScale = d3.scaleOrdinal()
                .domain(this.stableUniqueGenres)
                .range(fixedColors);

            const displayGenres = data.map(d => d.parent_genres);

            // Define scales
            const yScale = d3.scaleBand()
                .domain(displayGenres)
                .range([0, this.innerHeight])
                .padding(0.1);

            let xDomain = this.valueType === "raw"
                ? [0, d3.max(data, d => d.total)]
                : [0, 1];
            const xScale = d3.scaleLinear()
                .domain(xDomain)
                .range([0, this.innerWidth]);

            // Select or create the SVG container.
            let svg = d3.select(this.container).select("svg");
            if (svg.empty()) {
                svg = d3.select(this.container)
                    .append("svg")
                    .attr("width", this.width)
                    .attr("height", this.height);
                svg.append("g")
                    .attr("class", "chartArea")
                    .attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);
            }
            const chartArea = svg.select("g.chartArea");

            // Update x-axis
            chartArea.select(".x-axis").remove();
            chartArea.append("g")
                .attr("class", "x-axis")
                .call(d3.axisTop(xScale)
                    .ticks(5)
                    .tickFormat(this.valueType === "raw" ? d3.format("~s") : d3.format(".0%")))
                .attr("transform", "translate(0,0)")
                .append("text")
                .attr("x", this.innerWidth / 2)
                .attr("y", -30)
                .attr("fill", "#fff")
                .attr("text-anchor", "middle")
                .attr("font-weight", "bold")
                .attr("font-size", "20px")
                .text(this.valueType === "raw" ? "Total Songs" : "Proportion");

            // Update y-axis
            chartArea.select(".y-axis").remove();
            chartArea.append("g")
                .attr("class", "y-axis")
                .call(d3.axisLeft(yScale))
                .selectAll("text")
                .attr("fill", "#fff")
                .attr("font-size", "14px");

            // Data join for bar groups (keyed by genre)
            const barGroups = chartArea.selectAll(".bar-group")
                .data(data, d => d.parent_genres);

            // EXIT: remove old groups
            barGroups.exit().remove();

            // ENTER: create new groups
            const barGroupsEnter = barGroups.enter()
                .append("g")
                .attr("class", "bar-group")
                .attr("transform", d => `translate(0, ${yScale(d.parent_genres)})`);

            // Merge and transition the bar groups.
            barGroupsEnter.merge(barGroups)
                .transition().duration(750)
                .attr("transform", d => `translate(0, ${yScale(d.parent_genres)})`);

            // For each bar group, update the collaboration rectangle.
            const collabRect = chartArea.selectAll(".bar-group").selectAll(".collabRect")
                .data(d => [d]);
            collabRect.enter()
                .append("rect")
                .attr("class", "collabRect")
                .attr("x", 0)
                .attr("y", 0)
                .attr("height", yScale.bandwidth())
                .attr("width", 0)
                .attr("fill", d => colorScale(d.parent_genres))
                .style("pointer-events", "all")
                .merge(collabRect)
                .on("mouseover", (event, d) => {
                    console.log("collabRect mouseover", d);
                    const pct = (d.collabProp * 100).toFixed(1);
                    let tooltipText = `<strong>Year: ${d.year}</strong><br/>Genre: ${d.parent_genres}<br/>Collaboration: ${pct}%`;
                    if (this.valueType === "raw") {
                        tooltipText += `<br/>Number of Songs: ${d.collabCount}`;
                    }
                    d3.select("#tooltip")
                        .style("opacity", 1)
                        .html(tooltipText);
                })
                .on("mousemove", (event) => {
                    d3.select("#tooltip")
                        .style("left", event.pageX + 10 + "px")
                        .style("top", event.pageY + 10 + "px");
                })
                .on("mouseout", () => {
                    d3.select("#tooltip").style("opacity", 0);
                })
                .transition().duration(750)
                .attr("width", d => xScale(this.valueType === "raw" ? d.collabCount : d.collabProp));
            collabRect.exit().remove();

            // Update the solo rectangle.
            const soloRect = chartArea.selectAll(".bar-group").selectAll(".soloRect")
                .data(d => [d]);
            soloRect.enter()
                .append("rect")
                .attr("class", "soloRect")
                .attr("x", d => xScale(this.valueType === "raw" ? d.collabCount : d.collabProp))
                .attr("y", 0)
                .attr("height", yScale.bandwidth())
                .attr("width", 0)
                .attr("fill", d => d3.color(colorScale(d.parent_genres)).darker(2))
                .style("pointer-events", "all")
                .merge(soloRect)
                .on("mouseover", (event, d) => {
                    console.log("soloRect mouseover", d);
                    const pct = (d.soloProp * 100).toFixed(1);
                    let tooltipText = `<strong>Year: ${d.year}</strong><br/>Genre: ${d.parent_genres}<br/>Solo: ${pct}%`;
                    if (this.valueType === "raw") {
                        tooltipText += `<br/>Number of Songs: ${d.soloCount}`;
                    }
                    d3.select("#tooltip")
                        .style("opacity", 1)
                        .html(tooltipText);
                })
                .on("mousemove", (event) => {
                    d3.select("#tooltip")
                        .style("left", event.pageX + 10 + "px")
                        .style("top", event.pageY + 10 + "px");
                })
                .on("mouseout", () => {
                    d3.select("#tooltip").style("opacity", 0);
                })
                .transition().duration(750)
                .attr("x", d => xScale(this.valueType === "raw" ? d.collabCount : d.collabProp))
                .attr("width", d => xScale(this.valueType === "raw" ? d.soloCount : d.soloProp));
            soloRect.exit().remove();

            // Update the legend with the per-genre colours.
            this.addLegend(svg, colorScale);
        });
    }

    addLegend(svg, colorScale) {
        const legendX = this.margin.left + this.innerWidth + 20;
        let legend = svg.select(".legend");
        if (legend.empty()) {
            legend = svg.append("g")
                .attr("class", "legend")
                .attr("transform", `translate(${legendX}, ${this.margin.top})`);
        }
        // Clear previous legend entries.
        legend.selectAll("*").remove();
        // For each genre in the current top 10, add an entry.
        const legendData = this.stableUniqueGenres.slice(0, 10);
        legendData.forEach((genre, i) => {
            const g = legend.append("g")
                .attr("transform", `translate(0, ${i * 20})`);
            g.append("rect")
                .attr("x", 0)
                .attr("y", -8)
                .attr("width", 16)
                .attr("height", 16)
                .attr("fill", colorScale(genre));
            g.append("text")
                .text(genre)
                .attr("x", 20)
                .attr("y", 5)
                .style("font-size", "12px")
                .style("fill", "#fff");
        });
    }

    initFilters() {
        const container = document.querySelector(this.container);
        if (container.querySelector(".chart-controls")) return;

        const controlsDiv = document.createElement("div");
        controlsDiv.classList.add("chart-controls"); // We'll define its CSS as a 3-col grid

        // ---- Year Filter (left column) ----
        const yearGroup = document.createElement("div");
        yearGroup.classList.add("filter-group");
        // Label
        const yearLabel = document.createElement("label");
        yearLabel.textContent = "Year:";
        yearGroup.appendChild(yearLabel);
        // Slider
        const yearSlider = document.createElement("input");
        yearSlider.type = "range";
        yearSlider.classList.add("year-slider");
        yearSlider.min = "2017";
        yearSlider.max = "2024";
        yearSlider.step = "1";
        yearSlider.value = this.selectedYear;
        yearGroup.appendChild(yearSlider);
        // Value Display
        const yearValue = document.createElement("span");
        yearValue.classList.add("year-value");
        yearValue.textContent = yearSlider.value;
        yearGroup.appendChild(yearValue);

        // Listen for slider changes
        yearSlider.addEventListener("input", (e) => {
            this.selectedYear = e.target.value;
            yearValue.textContent = e.target.value;
            this.render();
        });

        // ---- Divider (middle column) ----
        const divider = document.createElement("div");
        divider.classList.add("filter-divider");

        // ---- View Filter (right column) ----
        const viewGroup = document.createElement("div");
        viewGroup.classList.add("filter-group");
        // Label
        const viewLabel = document.createElement("label");
        viewLabel.textContent = "View:";
        viewGroup.appendChild(viewLabel);
        // Dropdown
        const valueSelector = document.createElement("select");
        valueSelector.classList.add("view-selector");
        valueSelector.innerHTML = `
    <option value="proportion">Proportion</option>
    <option value="raw">Number of Songs</option>
  `;
        viewGroup.appendChild(valueSelector);

        valueSelector.addEventListener("change", (e) => {
            this.valueType = e.target.value;
            this.render();
        });

        // Append in the exact order
        controlsDiv.appendChild(yearGroup);
        controlsDiv.appendChild(divider);
        controlsDiv.appendChild(viewGroup);

        container.prepend(controlsDiv);
    }



}

window.BarChart = BarChart;
