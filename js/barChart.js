class BarChart {
    constructor(config) {
        this.dataPath = config.dataPath;
        this.container = config.container;
        this.width = config.width;
        this.height = config.height;
        this.margin = config.margin || {
            top: 20,
            right: 20,
            bottom: 60,
            left: 150,
        };
        this.innerWidth = this.width - this.margin.left - this.margin.right;
        this.innerHeight = this.height - this.margin.top - this.margin.bottom;
        this.selectedYear = config.selectedYear || "all";  // ALL or a specific year
        this.valueType = config.valueType || "proportion";   // "proportion" or "raw number"
        this.initFilters(); // add filters
    }

    async loadData() {
        let raw = await d3.csv(this.dataPath);
        // Exclude rows where parent_genres is nan
        raw = raw.filter(
            (d) => d.parent_genres && d.parent_genres.trim().toLowerCase() !== "nan"
        );
        raw.forEach(d => {
            d.parent_genres = d.parent_genres.trim();
        });
        this.stableUniqueGenres = Array.from(new Set(raw.map(d => d.parent_genres)));
        return raw;
    }

    processData(data) {
        // Trim years_on_chart
        data.forEach((d) => {
            d.years_on_chart = d.years_on_chart.trim();
        });

        // filter by selectedYear and if not, "all"
        if (this.selectedYear !== "all") {
            data = data.filter(d => d.years_on_chart === this.selectedYear);
        }

        // group by parent_genre
        const genreMap = d3.group(data, d => d.parent_genres);
        const result = [];
        for (const [genre, rows] of genreMap.entries()) {
            const soloCount = rows.filter(r => r.song_type === "Solo").length;
            const collabCount = rows.filter(r => r.song_type === "Collaboration").length;
            const total = soloCount + collabCount;
            if (total > 0) {
                result.push({
                    year: this.selectedYear !== "all" ? this.selectedYear : "all",
                    parent_genres: genre,
                    total,
                    soloCount,
                    collabCount,
                    soloProp: soloCount / total,
                    collabProp: collabCount / total,
                });
            }
        }
        // sort by total descending and pick top 10
        result.sort((a, b) => d3.descending(a.total, b.total));
        return result.slice(0, 10);
    }



    render() {
        this.loadData().then((rawData) => {
            const processed = this.processData(rawData);

            const stableUniqueGenres = this.stableUniqueGenres;

            let data = processed.slice();
            if (this.valueType === "raw") {
                data.sort((a, b) => d3.descending(a.total, b.total));
            } else {
                data.sort((a, b) => d3.descending(a.collabProp, b.collabProp));
            }

            // fixed colours
            const fixedColors = [
                "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728",
                "#9467bd", "#8c564b", "#e377c2", "#7f7f7f",
                "#bcbd22", "#17becf"
                ];

            const colorScale = d3.scaleOrdinal()
                .domain(stableUniqueGenres)
                .range(fixedColors);

            const displayGenres = data.map(d => d.parent_genres);

            // y-axis
            const yScale = d3.scaleBand()
                .domain(displayGenres)
                .range([0, this.innerHeight])
                .padding(0.1);

            // x-axis
            let xDomain = this.valueType === "raw"
                ? [0, d3.max(data, d => d.total)]
                : [0, 1];
            const xScale = d3.scaleLinear()
                .domain(xDomain)
                .range([0, this.innerWidth]);

            d3.select(this.container).select("svg").remove();

            // svg and chart area
            const svg = d3.select(this.container)
                .append("svg")
                .attr("width", this.width)
                .attr("height", this.height);
            const chartArea = svg.append("g")
                .attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);


            // x-axis
            const xAxis = d3.axisTop(xScale)
                .ticks(5)
                .tickFormat(this.valueType === "raw" ? d3.format("~s") : d3.format(".0%"));
            chartArea.append("g")
                .attr("class", "x-axis")
                .call(xAxis)
                .append("text")
                .attr("x", this.innerWidth / 2)
                .attr("y", -30)
                .attr("fill", "#fff")
                .attr("text-anchor", "middle")
                .attr("font-weight", "bold")
                .attr("font-size", "20px")
                .text(this.valueType === "raw" ? "Total Songs" : "Proportion");

            // y-axis for genres
            chartArea.append("g")
                .attr("class", "y-axis")
                .call(d3.axisLeft(yScale))
                .selectAll("text")
                .attr("fill", "#fff")
                .attr("font-size", "14px");

            // horizontal stacked bars for each genre
            const bars = chartArea.selectAll(".bar-group")
                .data(data)
                .join("g")
                .attr("class", "bar-group")
                .attr("transform", d => `translate(0, ${yScale(d.parent_genres)})`);

            // darker colours for solo
            bars.each(function(d) {
                d.baseColor = colorScale(d.parent_genres);
                d.darkerColor = d3.color(d.baseColor).darker(2);
            });

            // collab proportion
            bars.append("rect")
                .attr("class", "collabRect")
                .attr("x", 0)
                .attr("y", 0)
                .attr("height", yScale.bandwidth())
                .attr("width", 0) // INITIAL width 0 for transition
                .attr("fill", d => d.baseColor)
                .on("mouseover", (event, d) => {
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
                .transition()
                .duration(400)
                .ease(d3.easeCubic)
                .attr("width", d => xScale(this.valueType === "raw" ? d.collabCount : d.collabProp));

            // solo proportion
            bars.append("rect")
                .attr("class", "soloRect")
                .attr("x", d => xScale(this.valueType === "raw" ? d.collabCount : d.collabProp))
                .attr("y", 0)
                .attr("height", yScale.bandwidth())
                .attr("width", 0) // INITIAL width 0 for transition
                .attr("fill", d => d.darkerColor)
                .on("mouseover", (event, d) => {
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
                .transition()
                .duration(400)
                .ease(d3.easeCubic)
                .attr("width", d => xScale(this.valueType === "raw" ? d.soloCount : d.soloProp));

            this.addLegend(svg, uniqueGenres, colorScale)
        });
    }

    addLegend(svg, genres, colorScale){
        const legendX = this.margin.left + this.innerWidth + 20;
        const legend = svg.append("g")
            .attr("class", "legend")
            .attr("transform", `translate(${legendX}, ${this.margin.top})`);
        genres.forEach((genre, i) => {
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
        controlsDiv.classList.add("chart-controls");
        controlsDiv.style.marginBottom = "10px";
        controlsDiv.style.marginLeft = "20px";

        // year selector
        const yearLabel = document.createElement("label");
        yearLabel.textContent = "Select Year: ";
        const yearSelector = document.createElement("select");
        yearSelector.style.marginRight = "20px";
        yearSelector.innerHTML = `
            <option value="all">All Years</option>
            <option value="2017">2017</option>
            <option value="2018">2018</option>
            <option value="2019">2019</option>
            <option value="2020">2020</option>
            <option value="2021">2021</option>
            <option value="2022">2022</option>
            <option value="2023">2023</option>  
            <option value="2024">2024</option> 
        `;
        yearSelector.addEventListener("change", (e) => {
            this.selectedYear = e.target.value;
            this.render();
        });
        controlsDiv.appendChild(yearLabel);
        controlsDiv.appendChild(yearSelector);

        // value type selector
        const valueLabel = document.createElement("label");
        valueLabel.textContent = " View: ";
        const valueSelector = document.createElement("select");
        valueSelector.innerHTML = `
            <option value="proportion">Proportion</option>
            <option value="raw">Number of Songs</option>
        `;
        valueSelector.addEventListener("change", (e) => {
            this.valueType = e.target.value;
            this.render();
        });
        controlsDiv.appendChild(valueLabel);
        controlsDiv.appendChild(valueSelector);

        container.prepend(controlsDiv);
    }

}

window.BarChart = BarChart;
