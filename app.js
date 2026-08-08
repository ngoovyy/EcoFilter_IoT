(function() {
    // =====================================================
    // CẤU HÌNH FIREBASE
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

    let realtimeChart = null;
    let dataLogsHistory = [];
    let surveyPointsData = {}; // Tải trực tiếp từ Firebase

    window.addEventListener("load", () => {
        initRealtimeChart();
        setupGPSFeature();
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
                        let nearestKey = "P6";
                        let nearestObj = { name: "Khu dân cư Bình Chánh", group: "Nước sinh hoạt", alpha: 0.45 };

                        // Sử dụng surveyPoints tải từ Firebase
                        if (Object.keys(surveyPointsData).length > 0) {
                            for (const key in surveyPointsData) {
                                const pt = surveyPointsData[key];
                                let d = calculateHaversineDistance(uLat, uLon, pt.lat, pt.lon);
                                if (d < minDist) {
                                    minDist = d;
                                    nearestKey = key;
                                    nearestObj = pt;
                                }
                            }
                        }

                        btnGps.innerHTML = `<i class="fas fa-location-crosshairs"></i> Định vị GPS & Khớp Hệ Số α`;

                        if (gpsInfo) {
                            gpsInfo.textContent = `Tọa độ: (${uLat.toFixed(3)}, ${uLon.toFixed(3)}) | Điểm gần nhất: ${nearestKey} (${minDist.toFixed(2)} km)`;
                        }

                        // Cập nhật tọa độ & vị trí lên Firebase
                        database.ref("/EcoFilter/gps").update({ 
                            latitude: uLat, 
                            longitude: uLon,
                            lastUpdated: firebase.database.ServerValue.TIMESTAMP
                        });

                        database.ref("/EcoFilter/currentLocation").update({
                            pointID: nearestKey,
                            pointName: nearestObj.name,
                            alphaCoeff: nearestObj.alpha,
                            sourceType: nearestObj.group
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
        if (gpsInfo) gpsInfo.textContent = `${message}`;
    }

    function updateLocationUI(code, name, group, alpha) {
        const waterSourceEl = document.getElementById("waterSource");
        const alphaCoeffTextEl = document.getElementById("alphaCoeffText");

        if (waterSourceEl) waterSourceEl.textContent = `${code} - ${name}`;
        if (alphaCoeffTextEl) alphaCoeffTextEl.textContent = `Nhóm: ${group} | Hệ số α = ${parseFloat(alpha).toFixed(2)} mg/L`;
    }

    function setupCSVExport() {
        const btnExport = document.getElementById("btn-export-csv");
        if (!btnExport) return;
        btnExport.addEventListener("click", () => {
            if (dataLogsHistory.length === 0) {
                alert("Chưa có dữ liệu cảm biến để xuất CSV!");
                return;
            }
            let csvContent = "data:text/csv;charset=utf-8,Thoi Gian,Luu Luong (L/min),The Tich (L),Vi Nhua (mg),Dien Ap (V),NTU,TSS (mg/L),Bao Hoa (%)\n";
            dataLogsHistory.forEach(row => {
                csvContent += `${row.time},${row.flowRate},${row.waterVolume},${row.currentM},${row.voltage},${row.ntu},${row.tss},${row.saturation}\n`;
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
        // 1. Lấy danh sách Survey Points động từ Firebase
        database.ref("/EcoFilter/surveyPoints").on("value", (snapshot) => {
            const data = snapshot.val();
            if (data) {
                surveyPointsData = data;
            }
        });

        // 2. Theo dõi thông tin vị trí hiện tại
        database.ref("/EcoFilter/currentLocation").on("value", (snapshot) => {
            const locData = snapshot.val();
            if (locData) {
                updateLocationUI(
                    locData.pointID || "P6",
                    locData.pointName || "Khu dân cư Bình Chánh",
                    locData.sourceType || "Nước sinh hoạt",
                    locData.alphaCoeff !== undefined ? locData.alphaCoeff : 0.45
                );
            }
        });

        // 3. Đọc dữ liệu cảm biến chuẩn từ Firebase (ESP32 đã tính toán)
        database.ref("/EcoFilter/sensorData").on("value", (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            let flowRate = data.flowRate !== undefined ? parseFloat(data.flowRate) : 0;
            let V = data.waterVolume !== undefined ? parseFloat(data.waterVolume) : 0;
            let V_adc = data.turbidityVoltage !== undefined ? parseFloat(data.turbidityVoltage) : 3.3;
            let ntuVal = data.turbidityNTU !== undefined ? parseFloat(data.turbidityNTU) : 0;
            let tssVal = data.estimatedTSS !== undefined ? parseFloat(data.estimatedTSS) : 0;
            let M = data.currentM !== undefined ? parseFloat(data.currentM) : 0;
            let satPercent = data.saturation !== undefined ? parseFloat(data.saturation) : 0;
            let filterLife = data.filterLife !== undefined ? parseFloat(data.filterLife) : 100;
            let estTime = data.estimatedRemainingTime !== undefined ? parseFloat(data.estimatedRemainingTime) : -1;
            let status = data.maintenanceStatus || "NORMAL";

            const now = data.timestamp ? data.timestamp : Date.now();
            const timeStr = new Date(now).toLocaleTimeString();

            // Lưu dữ liệu vào mảng CSV
            dataLogsHistory.push({
                time: timeStr,
                flowRate: flowRate.toFixed(2),
                waterVolume: V.toFixed(2),
                currentM: M.toFixed(2),
                voltage: V_adc.toFixed(2),
                ntu: ntuVal.toFixed(1),
                tss: tssVal.toFixed(2),
                saturation: satPercent.toFixed(1)
            });
            if(dataLogsHistory.length > 500) dataLogsHistory.shift(); 

            updateUI(flowRate, V, M, satPercent, filterLife, V_adc, ntuVal, tssVal, estTime, status, timeStr);
        });
    }

    function updateUI(flowRate, V, M, satPercent, filterLife, V_adc, ntuVal, tssVal, estTime, status, timeStr) {
        document.getElementById("flow-rate").textContent = flowRate.toFixed(2);
        document.getElementById("water-volume").textContent = V.toFixed(2);
        document.getElementById("plastic-mass").textContent = M.toFixed(2);
        document.getElementById("progress-percent").textContent = satPercent.toFixed(0);
        document.getElementById("filter-life").textContent = filterLife.toFixed(0);

        const lastUpdateEl = document.getElementById("last-update-time");
        if (lastUpdateEl) lastUpdateEl.textContent = timeStr;

        const turbidityValEl = document.getElementById("turbidity-val");
        const turbidityVoltEl = document.getElementById("turbidity-voltage");
        const tssValEl = document.getElementById("tss-val");

        if (turbidityValEl) turbidityValEl.textContent = `${ntuVal.toFixed(1)} NTU`;
        if (turbidityVoltEl) turbidityVoltEl.textContent = `Điện áp: ${V_adc.toFixed(2)} V`;
        if (tssValEl) tssValEl.textContent = `TSS ước tính: ${tssVal.toFixed(2)} mg/L (Hệ số 0.3)`;

        // Progress Bar bão hòa
        const satBar = document.getElementById("progress-fill");
        const satIcon = document.getElementById("sat-icon");
        if (satBar) {
            satBar.style.width = `${satPercent.toFixed(0)}%`;
            if (satPercent >= 80) { satBar.style.backgroundColor = "#ef4444"; if (satIcon) satIcon.textContent = "🔴"; }
            else if (satPercent >= 50) { satBar.style.backgroundColor = "#eab308"; if (satIcon) satIcon.textContent = "🟡"; }
            else { satBar.style.backgroundColor = "#22c55e"; if (satIcon) satIcon.textContent = "🟢"; }
        }

        // Bảo trì dự báo
        const lifeEl = document.getElementById("filterLifeElement");
        const statusTagEl = document.getElementById("maintenance-status-tag");

        if (statusTagEl) {
            if (status === "REPLACE_NOW") {
                statusTagEl.className = "status-badge badge-danger";
                statusTagEl.textContent = "CẦN THAY MÀNG NGAY";
            } else if (status === "WARNING") {
                statusTagEl.className = "status-badge badge-warning";
                statusTagEl.textContent = "CẢNH BÁO BÃO HÒA";
            } else {
                statusTagEl.className = "status-badge badge-success";
                statusTagEl.textContent = "HOẠT ĐỘNG BÌNH THƯỜNG";
            }
        }

        if (lifeEl) {
            if (status === "REPLACE_NOW") {
                lifeEl.textContent = "⚠️ Màng đã bão hòa hoàn toàn! Hãy thay màng lọc mới.";
                lifeEl.style.color = "#dc2626";
            } else if (estTime < 0) {
                lifeEl.textContent = "Trạng thái van: Đang đóng (Chờ cấp nước để dự báo thời gian còn lại)";
                lifeEl.style.color = "#64748b";
            } else {
                let h = Math.floor(estTime / 60);
                let m = Math.round(estTime % 60);
                lifeEl.textContent = `Thời gian vận hành còn lại (với lưu lượng hiện tại): ${h} giờ ${m} phút`;
                lifeEl.style.color = "#1e293b";
            }
        }

        // Cập nhật biểu đồ
        if (realtimeChart) {
            realtimeChart.data.labels.push(timeStr);
            realtimeChart.data.datasets[0].data.push(V);
            realtimeChart.data.datasets[1].data.push(M);
            if (realtimeChart.data.labels.length > 10) {
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



