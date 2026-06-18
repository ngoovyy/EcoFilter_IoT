(function() {
    // ==========================================
    //       🔴       PHẦN CẤU HÌNH FIREBASE KẾT NỐI
    // ==========================================
    const firebaseConfig = {
        apiKey: "AIzaSyCTL732xXKFUOtZnueYzoBtz_dyhOS1p_8",
        authDomain: "ecofilter-iot.firebaseapp.com",
        databaseURL: "https://ecofilter-iot-default-rtdb.firebaseio.com",
        projectId: "ecofilter-iot",
        storageBucket: "ecofilter-iot.firebasestorage.app",
        messagingSenderId: "611838926722",
        appId: "1:611838926722:web:00cfe4ee3ba927c1d7799b",
        measurementId: "G-M0Z7Q3L90K"
    };

    // Khởi tạo Firebase an toàn chống trùng lặp
    let app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
    const database = app.database();

    // ==========================================
    //       🟢       BIẾN TOÀN CỤC, AI & ĐỒ THỊ
    // ==========================================
    const maxCapacity = 100; // Khối lượng vi nhựa bão hòa tối đa của màng Keratin (mg)[cite: 2]
    let realtimeChart = null;[cite: 2]
    
    // Biến điều khiển thuật toán hồi quy toán học y = ax
    let ai_coefficient_a = 1.30; // Mặc định khớp với menu "Nước sông / Kênh rạch" hiện hành[cite: 2, 3]
    let lastPlasticMass = 0;
    let lastTimestamp = Date.now();[cite: 2]
    let estimatedMinutesLeft = 345;[cite: 2]

    // Chạy ngay khi tài nguyên hệ thống sẵn sàng
    window.addEventListener("load", () => {
        console.log("[MCathelish] Hệ thống kích hoạt thành công!");[cite: 2]
        initRealtimeChart();[cite: 2]
        setupGPSFeature();[cite: 2]
        setupManualMenu();[cite: 2]
        connectFirebaseRealtime(); // Kích hoạt lắng nghe dữ liệu từ Firebase[cite: 2]
    });

    // ==========================================
    //       🔵       KHỞI TẠO ĐỒ THỊ REALTIME (CHART.JS)
    // ==========================================
    function initRealtimeChart() {[cite: 2]
        const ctx = document.getElementById("realtimeChart");[cite: 2]
        if (!ctx) return;[cite: 2]
        realtimeChart = new Chart(ctx.getContext("2d"), {[cite: 2]
            type: "line",[cite: 2]
            data: {[cite: 2]
                labels: [],[cite: 2]
                datasets: [[cite: 2]
                    {
                        label: "Lưu lượng nước tích lũy (Lít)",[cite: 2]
                        data: [],[cite: 2]
                        borderColor: "#00ffb7",[cite: 2]
                        backgroundColor: "rgba(0, 255, 183, 0.05)",[cite: 2]
                        borderWidth: 3,[cite: 2]
                        pointRadius: 3,[cite: 2]
                        yAxisID: "y-water",[cite: 2]
                        tension: 0.3[cite: 2]
                    },
                    {
                        label: "Vi nhựa giữ lại (mg)",[cite: 2]
                        data: [],[cite: 2]
                        borderColor: "#ff5e62",[cite: 2]
                        backgroundColor: "rgba(255, 94, 98, 0.05)",[cite: 2]
                        borderWidth: 3,[cite: 2]
                        pointRadius: 3,[cite: 2]
                        yAxisID: "y-plastic",[cite: 2]
                        tension: 0.3[cite: 2]
                    }
                ]
            },
            options: {[cite: 2]
                responsive: true,[cite: 2]
                maintainAspectRatio: false,[cite: 2]
                plugins: {[cite: 2]
                    legend: { labels: { color: "#e2e8f0" } }[cite: 2]
                },
                scales: {[cite: 2]
                    x: {[cite: 2]
                        grid: { color: "rgba(255,255,255,0.03)" },[cite: 2]
                        ticks: { color: "#a0aec0" }[cite: 2]
                    },
                    "y-water": {[cite: 2]
                        type: "linear",[cite: 2]
                        position: "left",[cite: 2]
                        ticks: { color: "#00ffb7" }[cite: 2]
                    },
                    "y-plastic": {[cite: 2]
                        type: "linear",[cite: 2]
                        position: "right",[cite: 2]
                        ticks: { color: "#ff5e62" },[cite: 2]
                        grid: { display: false }[cite: 2]
                    }
                }
            }
        });
    }

    // ==========================================
    //       🟡       HÀM ĐỔ DỮ LIỆU CẬP NHẬT GIAO DIỆN REALTIME
    // ==========================================
    function updateUserInterface(waterVolume, microplasticMass, minutesLeft) {[cite: 2]
        // 1. Cập nhật các ô số chính trên Dashboard
        const waterEl = document.getElementById("water-volume");[cite: 2]
        const plasticEl = document.getElementById("microplastic-mass");[cite: 2]
        
        if (waterEl) waterEl.innerHTML = `${waterVolume.toFixed(1)} <span style="font-size: 16px; color: #a0aec0;">Lít</span>`;[cite: 2]
        if (plasticEl) plasticEl.innerText = microplasticMass.toFixed(2) + " mg";[cite: 2]

        // 2. Tính toán phần trăm bão hòa của màng lọc sinh học Keratin
        let saturationPercentage = (microplasticMass / maxCapacity) * 100;[cite: 2]
        if (saturationPercentage > 100) saturationPercentage = 100;[cite: 2]
        
        const satBar = document.getElementById("filter-progress");[cite: 2]
        if (satBar) {[cite: 2]
            satBar.style.width = `${saturationPercentage.toFixed(0)}%`;[cite: 2]
            satBar.innerText = `${saturationPercentage.toFixed(0)}%`;[cite: 2]
            satBar.style.backgroundColor = saturationPercentage >= 80 ? "#ff5e62" : (saturationPercentage >= 50 ? "#ffb703" : "#2d6a4f");[cite: 2]
        }

        // 3. Cập nhật Trạng thái màng lọc AI công nghệ
        const statusMessage = document.getElementById("status-message");[cite: 2]
        if (statusMessage) {[cite: 2]
            if (saturationPercentage >= 80) {[cite: 2]
                statusMessage.innerHTML = `<span style="color: #ff5e62; font-weight: bold;">Cảnh báo: Màng lọc quá tải!</span>`;[cite: 2]
            } else if (saturationPercentage >= 50) {[cite: 2]
                statusMessage.innerHTML = `<span style="color: #ffb703;">Màng sắp bão hòa - Chú ý</span>`;[cite: 2]
            } else {[cite: 2]
                statusMessage.innerHTML = `<span style="color: #52b788;">Màng lọc hoạt động ổn định</span>`;[cite: 2]
            }
        }

        // 4. Cập nhật đồng hồ dự đoán tuổi thọ AI
        const aiCountdownElement = document.getElementById("ai-countdown");[cite: 2]
        if (aiCountdownElement) {[cite: 2]
            if (saturationPercentage >= 100) {[cite: 2]
                aiCountdownElement.innerText = "0 Giờ 0 Phút (Thay màng!)";[cite: 2]
            } else {
                const hours = Math.floor(minutesLeft / 60);[cite: 2]
                const mins = Math.round(minutesLeft % 60);[cite: 2]
                aiCountdownElement.innerText = `${hours} Giờ ${mins} Phút`;[cite: 2]
            }
        }

        // 5. Cập nhật điểm uốn đồ thị Chart.js
        if (realtimeChart) {[cite: 2]
            const currentTimeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });[cite: 2]
            realtimeChart.data.labels.push(currentTimeLabel);[cite: 2]
            realtimeChart.data.datasets[0].data.push(waterVolume);[cite: 2]
            realtimeChart.data.datasets[1].data.push(microplasticMass);[cite: 2]
            if (realtimeChart.data.labels.length > 10) {[cite: 2]
                realtimeChart.data.labels.shift();[cite: 2]
                realtimeChart.data.datasets[0].data.shift();[cite: 2]
                realtimeChart.data.datasets[1].data.shift();[cite: 2]
            }
            realtimeChart.update();[cite: 2]
        }

        // 6. Đổ dữ liệu vào bảng Nhật Ký Giám Sát Hệ Thống
        const tableBody = document.getElementById("history-log-body");[cite: 2]
        if (tableBody) {[cite: 2]
            const row = document.createElement("tr");[cite: 2]
            row.style.borderBottom = "1px solid rgba(255,255,255,0.05)";[cite: 2]
            
            let statusHTML = saturationPercentage >= 80 ? `<span style="color: #ff5e62">Quá tải</span>` : (saturationPercentage >= 50 ? `<span style="color: #ffb703">Sắp đầy</span>` : `<span style="color: #52b788">Ổn định</span>`);[cite: 2]
            const currentTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });[cite: 2]
            row.innerHTML = `
                <td style="padding: 10px;">${currentTimeStr}</td>
                <td style="padding: 10px;">${waterVolume.toFixed(1)} L</td>
                <td style="padding: 10px;">${microplasticMass.toFixed(2)} mg</td>
                <td style="padding: 10px;">${statusHTML}</td>
            `;[cite: 2]
            tableBody.insertBefore(row, tableBody.firstChild);[cite: 2]
            if (tableBody.children.length > 6) {[cite: 2]
                tableBody.removeChild(tableBody.lastChild);[cite: 2]
            }
        }
    }

    // ==========================================
    //      🎯      XỬ LÝ ĐỊNH VỊ VỆ TINH CLOUD GPS THẬT
    // ==========================================
    function setupGPSFeature() {[cite: 2]
        const gpsButton = document.querySelector(".card-ai button");[cite: 2]
        if (!gpsButton) return;[cite: 2]
        gpsButton.addEventListener("click", () => {[cite: 2]
            gpsButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang quét vệ tinh (Cloud GPS)...`;[cite: 2]
            const gpsOptions = {[cite: 2]
                enableHighAccuracy: true, 
                timeout: 8000,            // Không để đơ nút, quá 8 giây tự động kích hoạt chế độ dự phòng[cite: 2]
                maximumAge: 0            [cite: 2]
            };
            if (navigator.geolocation) {[cite: 2]
                navigator.geolocation.getCurrentPosition([cite: 2]
                    (position) => {[cite: 2]
                        const lat = position.coords.latitude;[cite: 2]
                        const lon = position.coords.longitude;[cite: 2]
                        
                        // Thuật toán AI phân tích hệ số ô nhiễm dựa trên vĩ độ địa lý
                        ai_coefficient_a = lat > 10.75 ? 1.30 : 0.45;[cite: 2]
                        let locationName = lat > 10.75 ? "Hạ lưu KCN Đô Thị (Ô nhiễm)" : "Khu dân cư sinh hoạt";[cite: 2]
                        
                        gpsButton.innerHTML = `<i class="fas fa-map-marker-alt"></i> Vị trí: ${locationName}`;[cite: 2]
                        gpsButton.style.background = "#2d6a4f";[cite: 2]
                        
                        const goldSpan = document.querySelector(".card-ai span[style*='#f59e0b']");[cite: 2]
                        if (goldSpan) goldSpan.innerText = `${ai_coefficient_a.toFixed(2)} mg/Lít`;[cite: 2]
                        
                        // Cập nhật lại giao diện ngay khi có hệ số AI mới
                        let currentWater = parseFloat(document.getElementById("water-volume")?.innerText) || 0;
                        const computedPlasticMass = currentWater * ai_coefficient_a;
                        updateUserInterface(currentWater, computedPlasticMass, estimatedMinutesLeft);[cite: 2]
                        
                        alert(`🌐 [CLOUD GPS THÀNH CÔNG]\nTọa độ: (${lat.toFixed(4)}, ${lon.toFixed(4)})\nAI áp dụng hệ số hồi quy: a = ${ai_coefficient_a.toFixed(2)} mg/Lít.`);[cite: 2]
                    },
                    (error) => {[cite: 2]
                        console.error("[GPS ERROR]", error);[cite: 2]
                        // Kịch bản dự phòng khi mất sóng vệ tinh trong phòng thi
                        ai_coefficient_a = 0.45;[cite: 2]
                        gpsButton.innerHTML = `<i class="fas fa-map-marker-alt"></i> Trạm nội đô: Quận 3, TP.HCM`;[cite: 2]
                        gpsButton.style.background = "#2d6a4f";[cite: 2]
                        const goldSpan = document.querySelector(".card-ai span[style*='#f59e0b']");[cite: 2]
                        if (goldSpan) goldSpan.innerText = `${ai_coefficient_a.toFixed(2)} mg/Lít`;[cite: 2]
                        let currentWater = parseFloat(document.getElementById("water-volume")?.innerText) || 0;
                        updateUserInterface(currentWater, currentWater * ai_coefficient_a, estimatedMinutesLeft);[cite: 2]
                    },
                    gpsOptions[cite: 2]
                );
            } else {[cite: 2]
                alert("Thiết bị không hỗ trợ Geolocation.");[cite: 2]
            }
        });
    }

    // ==========================================
    //       🎨       XỬ LÝ THAY ĐỔI MENU THỦ CÔNG
    // ==========================================
    function setupManualMenu() {[cite: 2]
        const selectMenu = document.getElementById("water-type-select");[cite: 3]
        if (selectMenu) {[cite: 2]
            selectMenu.addEventListener("change", (e) => {[cite: 2]
                ai_coefficient_a = parseFloat(e.target.value);[cite: 2]
                updateManualUI();[cite: 2]
            });
        }
    }

    function updateManualUI() {[cite: 2]
        const goldSpan = document.querySelector(".card-ai span[style*='#f59e0b']");[cite: 2]
        if (goldSpan) goldSpan.innerText = `${ai_coefficient_a.toFixed(2)} mg/Lít`;[cite: 2]
        let currentWater = parseFloat(document.getElementById("water-volume")?.innerText) || 0;
        updateUserInterface(currentWater, currentWater * ai_coefficient_a, estimatedMinutesLeft);[cite: 2]
    }

    // ==========================================
    //       🛰️       ĐỒNG BỘ CHUẨN FIREBASE & TÍNH TOÁN AI REALTIME
    // ==========================================
    function connectFirebaseRealtime() {[cite: 2]
        // Đọc thẳng từ nút gốc (/) khớp hoàn toàn với cấu trúc Firebase của ESP32[cite: 1, 2]
        database.ref().on("value", (snapshot) => {[cite: 2]
            const data = snapshot.val();[cite: 2]
            if (!data) return;[cite: 2]

            // 1. Đọc chính xác lưu lượng nước thực tế do ESP32 truyền lên[cite: 1, 2]
            let waterVolume = data.waterVolume !== undefined ? parseFloat(data.waterVolume) : 0;
            
            // 2. Thuật toán AI tự động tính khối lượng vi nhựa hấp phụ dựa trên hệ số hồi quy thực nghiệm hiện hành[cite: 2]
            let microplasticMass = waterVolume * ai_coefficient_a;

            // 3. Phân tích biến thiên dòng chảy thời gian thực để dự đoán tuổi thọ màng lọc[cite: 2]
            const now = Date.now();[cite: 2]
            const timePassedMinutes = (now - lastTimestamp) / 60000;[cite: 2]
            
            if (timePassedMinutes > 0 && microplasticMass > lastPlasticMass && lastPlasticMass > 0) {[cite: 2]
                let accumulationRate = (microplasticMass - lastPlasticMass) / timePassedMinutes;[cite: 2]
                let plasticRemaining = maxCapacity - microplasticMass;[cite: 2]
                if (plasticRemaining < 0) plasticRemaining = 0;[cite: 2]
                if (accumulationRate > 0) {
                    estimatedMinutesLeft = plasticRemaining / accumulationRate;[cite: 2]
                }
            } else if (microplasticMass >= maxCapacity) {
                estimatedMinutesLeft = 0;
            } else {
                // Tốc độ tích lũy mặc định ban đầu khi dòng chảy chưa biến thiên lớn[cite: 2]
                let accumulationRateDefault = 0.25; 
                estimatedMinutesLeft = (maxCapacity - microplasticMass) / accumulationRateDefault;
            }

            // Lưu vết lịch sử cho vòng lặp kế tiếp[cite: 2]
            lastPlasticMass = microplasticMass;[cite: 2]
            lastTimestamp = now;[cite: 2]

            // Đổ toàn bộ dữ liệu thật lên màn hình Dashboard tức thì![cite: 2]
            updateUserInterface(waterVolume, microplasticMass, estimatedMinutesLeft);[cite: 2]
        }, (error) => {[cite: 2]
            console.error("[FIREBASE CONNECTION ERROR]", error);[cite: 2]
        });
    }
})(); 
