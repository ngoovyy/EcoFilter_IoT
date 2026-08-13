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
    let surveyPointsData = {};

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

    // Phân loại trạng thái nước theo NTU tương đối
    function getWaterStatus(ntu) {
        if (ntu < 1000) {
            return "🟢 Nước trong / tương đối trong";
        } else if (ntu < 2000) {
            return "🟡 Nước đục nhẹ";
        } else if (ntu < 3000) {
            return "🟠 Nước đục";
        } else {
            return "🔴 Nước rất đục";
        }
    }

    function setupCSVExport() {
        const btnExport = document.getElementById("btn-export-csv");
        if (!btnExport) return;
        btnExport.addEventListener("click", () => {
            if (dataLogsHistory.length === 0) {
                alert("Chưa có dữ liệu cảm biến để xuất CSV!");
                return;
            }
            // Đã xóa cột TSS khỏi CSV
            let csvContent = "data:text/csv;charset=utf-8,Thoi Gian,Luu Luong (L/min),The Tich (L),Vi Nhua (mg),Dien Ap (V),NTU Tuong Doi,Bao Hoa (%)\n";
            dataLogsHistory.forEach(row => {
                csvContent += `${row.time},${row.flowRate},${row.waterVolume},${row.currentM},${row.voltage},${row.ntu},${row.saturation}\n`;
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
        database.ref("/EcoFilter/surveyPoints").on("value", (snapshot) => {
            const data = snapshot.val();
            if (data) surveyPointsData = data;
        });

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

        database.ref("/EcoFilter/sensorData").on("value", (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            let flowRate = data.flowRate !== undefined ? parseFloat(data.flowRate) : 0;
            let V = data.waterVolume !== undefined ? parseFloat(data.waterVolume) : 0;
            let V_adc = data.turbidityVoltage !== undefined ? parseFloat(data.turbidityVoltage) : 3.3;
            let ntuVal = data.turbidityNTU !== undefined ? parseFloat(data.turbidityNTU) : 0;
            let M = data.currentM !== undefined ? parseFloat(data.currentM) : 0;
            let satPercent = data.saturation !== undefined ? parseFloat(data.saturation) : 0;
            let filterLife = data.filterLife !== undefined ? parseFloat(data.filterLife) : 100;
            let estTime = data.estimatedRemainingTime !== undefined ? parseFloat(data.estimatedRemainingTime) : -1;
            let status = data.maintenanceStatus || "NORMAL";

            const now = data.timestamp ? data.timestamp : Date.now();
            const timeStr = new Date(now).toLocaleTimeString();

            // Lưu dữ liệu vào mảng xuất CSV
            dataLogsHistory.push({
                time: timeStr,
                flowRate: flowRate.toFixed(2),
                waterVolume: V.toFixed(2),
                currentM: M.toFixed(2),
                voltage: V_adc.toFixed(2),
                ntu: Math.round(ntuVal),
                saturation: satPercent.toFixed(1)
            });
            if(dataLogsHistory.length > 500) dataLogsHistory.shift(); 

            updateUI(flowRate, V, M, satPercent, filterLife, V_adc, ntuVal, estTime, status, timeStr);
        });
    }

    function updateUI(flowRate, V, M, satPercent, filterLife, V_adc, ntuVal, estTime, status, timeStr) {
        document.getElementById("flow-rate").textContent = flowRate.toFixed(2);
        document.getElementById("water-volume").textContent = V.toFixed(2);
        document.getElementById("plastic-mass").textContent = M.toFixed(2);
        document.getElementById("progress-percent").textContent = satPercent.toFixed(0);
        document.getElementById("filter-life").textContent = filterLife.toFixed(0);

        const lastUpdateEl = document.getElementById("last-update-time");
        if (lastUpdateEl) lastUpdateEl.textContent = timeStr;

        // Cập nhật card Độ Đục & Trạng Thái Nước
        const turbidityValEl = document.getElementById("turbidity-val");
        const turbidityVoltEl = document.getElementById("turbidity-voltage");
        const waterStatusEl = document.getElementById("water-status");

        if (turbidityValEl) turbidityValEl.textContent = `${Math.round(ntuVal)} NTU (tương đối)`;
        if (turbidityVoltEl) turbidityVoltEl.textContent = `Điện áp: ${V_adc.toFixed(2)} V`;
        if (waterStatusEl) waterStatusEl.textContent = getWaterStatus(ntuVal);

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

        // Cập nhật biểu đồ (NTU Tương đối & Vi nhựa M theo Thời gian)
        if (realtimeChart) {
            realtimeChart.data.labels.push(timeStr);
            realtimeChart.data.datasets[0].data.push(Math.round(ntuVal));
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
                    { 
                        label: "Độ đục tương đối (NTU)", 
                        data: [], 
                        borderColor: "#0284c7", 
                        backgroundColor: "rgba(2, 132, 199, 0.1)",
                        borderWidth: 2, 
                        pointRadius: 3, 
                        yAxisID: "y-ntu" 
                    },
                    { 
                        label: "Khối lượng vi nhựa ước tính (mg)", 
                        data: [], 
                        borderColor: "#ef4444", 
                        backgroundColor: "rgba(239, 68, 68, 0.1)",
                        borderWidth: 2, 
                        pointRadius: 3, 
                        yAxisID: "y-plastic" 
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { ticks: { font: { size: 9 } } },
                    "y-ntu": { 
                        type: "linear", 
                        position: "left", 
                        title: { display: true, text: "NTU Tương đối", font: { size: 10 } },
                        ticks: { font: { size: 9 }, color: "#0284c7" } 
                    },
                    "y-plastic": { 
                        type: "linear", 
                        position: "right", 
                        title: { display: true, text: "Vi nhựa M (mg)", font: { size: 10 } },
                        ticks: { font: { size: 9 }, color: "#ef4444" }, 
                        grid: { display: false } 
                    }
                }
            }
        });
    }
})();
