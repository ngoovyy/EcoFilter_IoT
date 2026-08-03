(function() {
    // =====================================================
    // CẤU HÌNH HẰNG SỐ VÀ FIREBASE
    // =====================================================
    const firebaseConfig = {
        apiKey: "AIzaSyCTL732xXKFUOtZnueYzoBtz_dyhOS1p_8",
        authDomain: "ecofilter-iot.firebaseapp.com",
        databaseURL: "https://ecofilter-iot-default-rtdb.firebaseio.com",
        projectId: "ecofilter-iot",
        storageBucket: "ecofilter-iot.firebasestorage.app",
        messagingSenderId: "611838926722",
        appId: "1:611838926722:web:00cfe4ee3ba927c1d7799b"
    };

    let app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
    const database = app.database();

    const M_MAX = 100.0; 
    const DEFAULT_FILTER_LIFE_MINUTES = 360; 

    const REGIONAL_LOCATIONS = [
        { code: "P1", name: "Khu chế xuất Tân Thuận (Quận 7)", lat: 10.748, lon: 106.726, group: "Khu công nghiệp", alpha: 1.30, citation: "Rügner et al. (2013)" },
        { code: "P2", name: "Khu công nghiệp Hiệp Phước (Nhà Bè)", lat: 10.660, lon: 106.742, group: "Khu công nghiệp", alpha: 1.35, citation: "Rügner et al. (2013)" },
        { code: "P3", name: "Khu công nghiệp Tân Bình", lat: 10.801, lon: 106.639, group: "Khu công nghiệp", alpha: 1.25, citation: "Rügner et al. (2013)" },
        { code: "P4", name: "Hồ Bán Nguyệt (Phú Mỹ Hưng)", lat: 10.729, lon: 106.722, group: "Nước mặt đô thị", alpha: 0.70, citation: "Hannouche et al. (2011)" },
        { code: "P5", name: "Công viên Tao Đàn", lat: 10.776, lon: 106.691, group: "Nước mặt đô thị", alpha: 0.65, citation: "Hannouche et al. (2011)" },
        { code: "P6", name: "Khu dân cư Bình Chánh", lat: 10.823, lon: 106.593, group: "Nước thải sinh hoạt", alpha: 0.45, citation: "WHO / Quy chuẩn kỹ thuật QCVN" },
        { code: "P7", name: "Khu dân cư Quận 12", lat: 10.868, lon: 106.640, group: "Nước thải sinh hoạt", alpha: 0.45, citation: "WHO / Quy chuẩn kỹ thuật QCVN" },
        { code: "P8", name: "Khu dân cư Thủ Đức", lat: 10.849, lon: 106.772, group: "Nước thải sinh hoạt", alpha: 0.50, citation: "WHO / Quy chuẩn kỹ thuật QCVN" }
    ];

    let alpha_coefficient = 0.45;
    let realtimeChart = null;
    let lastPlasticMass = 0;
    let lastTimestamp = 0;
    let estimatedMinutesLeft = DEFAULT_FILTER_LIFE_MINUTES;
    let isRelayOff = false;
    let dataLogsHistory = [];

    window.addEventListener("load", () => {
        initRealtimeChart();
        setupGPSFeature();
        setupRelayManualControl();
        setupCSVExport();
        connectFirebaseRealtime();
    });

    function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371.0;
        const dLat = (lat2 - lat1) * Math.PI / 180.0;
        const dLon = (lon2 - lon1) * Math.PI / 180.0;
        const a = Math.sin(dLat / 2.0) * Math.sin(dLat / 2.0) +
                  Math.cos(lat1 * Math.PI / 180.0) * Math.cos(lat2 * Math.PI / 180.0) *
                  Math.sin(dLon / 2.0) * Math.sin(dLon / 2.0);
        return R * (2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a)));
    }

    function setupGPSFeature() {
        const btnGps = document.getElementById("btn-gps");
        const gpsInfo = document.getElementById("gps-info");
        if (!btnGps) return;

        btnGps.addEventListener("click", () => {
            btnGps.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang tính toán vị trí...`;

            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const uLat = position.coords.latitude;
                        const uLon = position.coords.longitude;
                        let minDist = Infinity;
                        let nearest = REGIONAL_LOCATIONS[0];

                        REGIONAL_LOCATIONS.forEach(loc => {
                            let d = calculateHaversineDistance(uLat, uLon, loc.lat, loc.lon);
                            if (d < minDist) { 
                                minDist = d; 
                                nearest = loc; 
                            }
                        });

                        alpha_coefficient = nearest.alpha;
                        btnGps.innerHTML = `<i class="fas fa-location-crosshairs"></i> Định vị GPS & Khớp Hệ Số α`;

                        if (gpsInfo) {
                            gpsInfo.textContent = `Tọa độ: (${uLat.toFixed(3)}, ${uLon.toFixed(3)}) | Khu vực: ${nearest.code} (${minDist.toFixed(2)} km)`;
                        }

                        updateLocationUI(nearest.code, nearest.name, nearest.group, nearest.alpha, nearest.citation);

                        database.ref("/EcoFilter/gps").update({ 
                            latitude: uLat, 
                            longitude: uLon,
                            lastUpdated: firebase.database.ServerValue.TIMESTAMP
                        });

                        database.ref("/EcoFilter/currentLocation").update({
                            pointID: nearest.code,
                            pointName: nearest.name,
                            alphaCoeff: nearest.alpha,
                            sourceType: nearest.group,
                            citation: nearest.citation
                        });

                        database.ref("/EcoFilter/gpsHistory").push({
                            timestamp: firebase.database.ServerValue.TIMESTAMP,
                            latitude: uLat,
                            longitude: uLon,
                            matchedPoint: nearest.code
                        });
                    },
                    (error) => {
                        handleGPSFallback("Không thể lấy vị trí GPS từ thiết bị!");
                    }
                );
            } else {
                handleGPSFallback("Thiết bị không hỗ trợ Geolocation API!");
            }
        });
    }

    function handleGPSFallback(message) {
        const btnGps = document.getElementById("btn-gps");
        const gpsInfo = document.getElementById("gps-info");

        if (btnGps) btnGps.innerHTML = `<i class="fas fa-location-crosshairs"></i> Định vị GPS & Khớp Hệ Số α`;
        if (gpsInfo) gpsInfo.textContent = `${message} Mặc định chọn khu vực P6 (Bình Chánh).`;

        alpha_coefficient = 0.45;
        const defaultLoc = REGIONAL_LOCATIONS.find(l => l.code === "P6") || REGIONAL_LOCATIONS[5];
        
        updateLocationUI(defaultLoc.code, defaultLoc.name, defaultLoc.group, defaultLoc.alpha, defaultLoc.citation);

        database.ref("/EcoFilter/currentLocation").update({
            pointID: defaultLoc.code,
            pointName: defaultLoc.name,
            alphaCoeff: defaultLoc.alpha,
            sourceType: defaultLoc.group,
            citation: defaultLoc.citation
        });
    }

    function updateLocationUI(code, name, group, alpha, citation) {
        const waterSourceEl = document.getElementById("waterSource");
        const alphaCoeffTextEl = document.getElementById("alphaCoeffText");

        if (waterSourceEl) waterSourceEl.textContent = `${code} - ${name}`;
        if (alphaCoeffTextEl) alphaCoeffTextEl.textContent = `Nhóm: ${group} | Hệ số α = ${alpha.toFixed(2)} mg/L (Tự động cập nhật theo GPS)`;
    }

    function setupRelayManualControl() {
        const btnToggle = document.getElementById("btn-toggle-relay");
        if (!btnToggle) return;
        btnToggle.addEventListener("click", () => {
            isRelayOff = !isRelayOff;
            database.ref("/EcoFilter/relay/relayOff").set(isRelayOff);
        });
    }

    function setupCSVExport() {
        const btnExport = document.getElementById("btn-export-csv");
        if (!btnExport) return;
        btnExport.addEventListener("click", () => {
            if (dataLogsHistory.length === 0) {
                alert("Chưa có dữ liệu cảm biến để xuất CSV!");
                return;
            }
            let csvContent = "data:text/csv;charset=utf-8,Thoi Gian,The Tich (L),Vi Nhua (mg),Do Duc (NTU),Dien Ap (V)\n";
            dataLogsHistory.forEach(row => {
                csvContent += `${row.time},${row.waterVolume},${row.plasticMass},${row.ntu},${row.voltage}\n`;
            });

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `EcoFilter_DataLogs_${Date.now()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    function connectFirebaseRealtime() {
        database.ref("/EcoFilter/relay/relayOff").on("value", (snapshot) => {
            isRelayOff = snapshot.val() === true;
            const statusText = document.getElementById("relay-status-text");
            const btnToggle = document.getElementById("btn-toggle-relay");
            if (isRelayOff) {
                if (statusText) { statusText.textContent = "ĐÃ NGẮT (DỪNG BƠM)"; statusText.style.color = "#dc2626"; }
                if (btnToggle) { btnToggle.className = "btn-action btn-success"; btnToggle.innerHTML = `<i class="fas fa-play"></i> Bật Lại Máy Bơm`; }
            } else {
                if (statusText) { statusText.textContent = "ĐANG BẬT (HOẠT ĐỘNG)"; statusText.style.color = "#16a34a"; }
                if (btnToggle) { btnToggle.className = "btn-action btn-danger"; btnToggle.innerHTML = `<i class="fas fa-power-off"></i> Ngắt Máy Bơm Khẩn Cấp`; }
            }
        });

        database.ref("/EcoFilter/currentLocation").on("value", (snapshot) => {
            const locData = snapshot.val();
            if (locData) {
                if (locData.alphaCoeff) alpha_coefficient = parseFloat(locData.alphaCoeff);
                updateLocationUI(
                    locData.pointID || "P6",
                    locData.pointName || "Khu dân cư Bình Chánh",
                    locData.sourceType || "Nước thải sinh hoạt",
                    alpha_coefficient,
                    locData.citation || "WHO / Quy chuẩn kỹ thuật QCVN"
                );
            }
        });

        database.ref("/EcoFilter/sensorData").on("value", (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            let V = data.waterVolume ? parseFloat(data.waterVolume) : 0;
            let V_adc = data.turbidity ? parseFloat(data.turbidity) : 3.3; 
            
            let rawNTU = -1120.4 * (V_adc * V_adc) + 5742.3 * V_adc - 4353.8;
            let ntuVal = Math.min(3000, Math.max(0, rawNTU));

            let M = data.currentM !== undefined ? parseFloat(data.currentM) : (alpha_coefficient * V);
            let satPercent = (M / M_MAX) * 100.0;
            if (satPercent > 100) satPercent = 100;

            // Fail-Safe
            if (satPercent >= 100.0 && !isRelayOff) {
                database.ref("/EcoFilter/relay/relayOff").set(true);
            }

            // Đồng bộ Timestamp thực từ ESP32
            const now = data.timestamp ? data.timestamp : Date.now();
            const timeStr = new Date(now).toLocaleTimeString();

            if (lastTimestamp > 0 && lastPlasticMass > 0) {
                const dtMinutes = (now - lastTimestamp) / 60000.0;
                if (dtMinutes > 0 && M > lastPlasticMass) {
                    let dM_dt = (M - lastPlasticMass) / dtMinutes; 
                    if (dM_dt > 0) {
                        estimatedMinutesLeft = (M_MAX - M) / dM_dt;
                    }
                }
            } else {
                estimatedMinutesLeft = DEFAULT_FILTER_LIFE_MINUTES; 
            }

            if (M >= M_MAX) {
                estimatedMinutesLeft = 0;
            }

            lastPlasticMass = M;
            lastTimestamp = now;

            // Lưu dữ liệu vào mảng CSV
            dataLogsHistory.push({
                time: timeStr,
                waterVolume: V.toFixed(2),
                plasticMass: M.toFixed(2),
                ntu: ntuVal.toFixed(1),
                voltage: V_adc.toFixed(2)
            });
            if(dataLogsHistory.length > 500) dataLogsHistory.shift(); 

            updateUI(V, M, satPercent, estimatedMinutesLeft, V_adc, ntuVal, timeStr);
        });
    }

    function getWaterTurbidityStatus(ntuVal) {
        if (ntuVal < 10) {
            return { status: "Độ đục thấp", color: "#16a34a", icon: "🟢" };
        } else if (ntuVal < 50) {
            return { status: "Độ đục trung bình", color: "#d97706", icon: "🟡" };
        } else {
            return { status: "Độ đục cao", color: "#dc2626", icon: "🔴" };
        }
    }

    function updateUI(V, M, satPercent, minsLeft, V_adc, ntuVal, timeStr) {
        document.getElementById("water-volume").textContent = V.toFixed(2);
        document.getElementById("plastic-mass").textContent = M.toFixed(2);
        document.getElementById("progress-percent").textContent = satPercent.toFixed(0);
        document.getElementById("filter-life").textContent = (100 - satPercent).toFixed(0);

        const lastUpdateEl = document.getElementById("last-update-time");
        if (lastUpdateEl) lastUpdateEl.textContent = timeStr;

        const turbidityValEl = document.getElementById("turbidity-val");
        const turbidityVoltEl = document.getElementById("turbidity-voltage");
        const turbidityStatusInfo = getWaterTurbidityStatus(ntuVal);

        if (turbidityValEl) {
            turbidityValEl.innerHTML = `${ntuVal.toFixed(1)} NTU <span style="font-size: 0.85rem; font-weight: normal; color: ${turbidityStatusInfo.color};">(${turbidityStatusInfo.icon} ${turbidityStatusInfo.status})</span>`;
        }
        if (turbidityVoltEl) {
            turbidityVoltEl.textContent = `Tín hiệu điện áp: ${V_adc.toFixed(2)} V (Đã lọc nhiễu Moving Average)`;
        }

        const satBar = document.getElementById("progress-fill");
        const satIcon = document.getElementById("sat-icon");
        if (satBar) {
            satBar.style.width = `${satPercent.toFixed(0)}%`;
            if (satPercent >= 80) { satBar.style.backgroundColor = "#ef4444"; if (satIcon) satIcon.textContent = "🔴"; }
            else if (satPercent >= 50) { satBar.style.backgroundColor = "#eab308"; if (satIcon) satIcon.textContent = "🟡"; }
            else { satBar.style.backgroundColor = "#22c55e"; if (satIcon) satIcon.textContent = "🟢"; }
        }

        const lifeEl = document.getElementById("filterLifeElement");
        if (lifeEl) {
            if (satPercent >= 100) { 
                lifeEl.textContent = "⚠️ CẢNH BÁO: Màng bão hòa vi nhựa (M ≥ Mmax) - Đã ngắt máy bơm khẩn cấp!"; 
                lifeEl.style.color = "#dc2626";
            } else {
                let h = Math.floor(minsLeft / 60);
                let m = Math.round(minsLeft % 60);
                lifeEl.textContent = `Bảo trì dự kiến: ${h} giờ ${m} phút`;
                lifeEl.style.color = "#334155";
            }
        }

        if (realtimeChart) {
            realtimeChart.data.labels.push(timeStr);
            realtimeChart.data.datasets[0].data.push(V);
            realtimeChart.data.datasets[1].data.push(M);
            if (realtimeChart.data.labels.length > 8) {
                realtimeChart.data.labels.shift();
                realtimeChart.data.datasets[0].data.shift();
                realtimeChart.data.datasets[1].data.shift();
            }
            realtimeChart.update();
        }
    }

    function initRealtimeChart() {
        const ctx = document.getElementById("realtimeChart");
        if (!ctx) return;
        realtimeChart = new Chart(ctx.getContext("2d"), {
            type: "line",
            data: {
                labels: [],
                datasets: [
                    { label: "Thể tích V (L)", data: [], borderColor: "#0284c7", borderWidth: 2, pointRadius: 2, yAxisID: "y-water" },
                    { label: "Vi nhựa M (mg)", data: [], borderColor: "#ef4444", borderWidth: 2, pointRadius: 2, yAxisID: "y-plastic" }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { ticks: { font: { size: 9 } } },
                    "y-water": { type: "linear", position: "left", ticks: { font: { size: 9 }, color: "#0284c7" } },
                    "y-plastic": { type: "linear", position: "right", ticks: { font: { size: 9 }, color: "#ef4444" }, grid: { display: false } }
                }
            }
        });
    }
})();



