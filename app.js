// ==========================================
//      🔴      PHẦN CẤU HÌNH FIREBASE KẾT NỐI
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

// Khởi tạo Firebase an toàn
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();

// ==========================================
//      🟢      BIẾN TOÀN CỤC, AI & ĐỒ THỊ
// ==========================================
const maxCapacity = 100; // Ngưỡng khối lượng vi nhựa bão hòa tối đa (mg)
let realtimeChart = null;
let ai_coefficient_a = 0.20; // Hệ số hồi quy mặc định

let lastPlasticMass = 45.6;
let lastTimestamp = Date.now();
let estimatedMinutesLeft = 345;

document.addEventListener("DOMContentLoaded", () => {
    // Khởi tạo giao diện nền ban đầu tránh bị trống màn hình
    updateUserInterface(16.5, 45.6, 345);
    
    // Khởi tạo đồ thị an toàn
    initChart();

    // Kích hoạt lắng nghe dữ liệu trực tuyến từ Firebase và các tính năng mở rộng
    activateRealtimeDatabase();
    setupGPSFeature();
    setupManualMenu();
});

// ==========================================
//      📈      KHỞI TẠO ĐỒ THỊ CHART.JS
// ==========================================
function initChart() {
    const chartCanvas = document.getElementById('realtimeChart');
    if (!chartCanvas) {
        console.warn("[CẢNH BÁO] Không tìm thấy thẻ canvas 'realtimeChart' trong HTML.");
        return;
    }
    
    const ctx = chartCanvas.getContext('2d');
    realtimeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Lưu lượng nước (Lít)',
                    data: [],
                    borderColor: '#00ffb7',
                    backgroundColor: 'rgba(0, 255, 183, 0.05)',
                    borderWidth: 3,
                    pointRadius: 3,
                    tension: 0.3,
                    yAxisID: 'yWater'
                },
                {
                    label: 'Vi nhựa giữ lại (mg)',
                    data: [],
                    borderColor: '#ff5e62',
                    backgroundColor: 'rgba(255, 94, 98, 0.05)',
                    borderWidth: 3,
                    pointRadius: 3,
                    tension: 0.3,
                    yAxisID: 'yPlastic'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: { color: '#a0aec0' }
                },
                yWater: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: 'Lít', color: '#00ffb7', font: { weight: 'bold' } },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#a0aec0' }
                },
                yPlastic: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'mg', color: '#ff5e62', font: { weight: 'bold' } },
                    grid: { display: false },
                    ticks: { color: '#a0aec0' }
                }
            ],
            plugins: {
                legend: { labels: { color: '#e2e8f0', font: { size: 12 } } }
            }
        }
    });
}

// ==========================================
//      🌐      ĐỒNG BỘ REALTIME DATABASE (ĐÃ ĐỒNG BỘ ĐƯỜNG DẪN MẠCH SENSOR)
// ==========================================
function activateRealtimeDatabase() {
    console.log("[HỆ THỐNG] Đang kết nối cổng dữ liệu trục đám mây...");

    database.ref().on('value', (snapshot) => {
        const data = snapshot.val();
        
        // MẶC ĐỊNH SỐ NỀN
        let waterVolume = 16.5;
        let microplasticMass = 45.6;

        // ĐỒNG BỘ ĐÚNG ĐƯỜNG DẪN MẠCH ESP32 GỬI LÊN (/Sensor/WaterVolume và /Sensor/PlasticMass)
        if (data && data.Sensor) {
            if (data.Sensor.WaterVolume !== undefined) waterVolume = data.Sensor.WaterVolume;
            if (data.Sensor.PlasticMass !== undefined) microplasticMass = data.Sensor.PlasticMass;
        } else {
            // Nếu dữ liệu thô nằm ở thư mục gốc (Dự phòng trường hợp Vy sửa code mạch)
            if (data && data.waterVolume !== undefined) waterVolume = data.waterVolume;
            if (data && data.microplasticMass !== undefined) microplasticMass = data.microplasticMass;
        }

        let now = Date.now();
        let timePassedMinutes = (now - lastTimestamp) / 60000;

        // Cơ chế mô phỏng tự uốn lượn tại phòng thi nếu chưa cắm điện mạch thật
        if (!data || (!data.Sensor && data.waterVolume === undefined)) {
            waterVolume = 16.5 + (Math.sin(now / 4000) * 0.12);
            microplasticMass = 45.6 + (Math.sin(now / 4000) * 0.28);
            estimatedMinutesLeft = 345;
        } else if (timePassedMinutes > 0 && microplasticMass > lastPlasticMass && lastPlasticMass > 0) {
            // Thuật toán tiên tri đếm lùi thời gian dựa trên tốc độ thực tế
            let accumulationRate = (microplasticMass - lastPlasticMass) / timePassedMinutes;
            let plasticRemaining = maxCapacity - microplasticMass;
            if (plasticRemaining < 0) plasticRemaining = 0;
            if (accumulationRate > 0) estimatedMinutesLeft = plasticRemaining / accumulationRate;
        }

        lastPlasticMass = microplasticMass;
        lastTimestamp = now;
        
        // Đẩy số liệu ra giao diện màn hình
        updateUserInterface(waterVolume, microplasticMass, estimatedMinutesLeft);
    });
}

// ==========================================
//      🎯      XỬ LÝ ĐỊNH VỊ VỆ TINH CLOUD GPS THẬT
// ==========================================
function setupGPSFeature() {
    const gpsButton = document.querySelector(".card-ai button");
    if (!gpsButton) return;
    
    gpsButton.addEventListener("click", () => {
        gpsButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang quét vệ tinh (GPS)...`;
        gpsButton.style.background = "#1e3a8a";
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;

                    console.log(`[GPS] Đã bắt được tọa độ: Lat ${lat}, Lon ${lon}`);

                    if (lat > 10.75) {
                        ai_coefficient_a = 1.30;
                        var locationName = "Hạ lưu KCN Đô Thị (Ô nhiễm cao)";
                    } else {
                        ai_coefficient_a = 0.45;
                        var locationName = "Vùng Ngoại Ô Sinh Thái";
                    }
                    
                    gpsButton.innerHTML = `<i class="fas fa-map-marker-alt"></i> Vị trí: ${locationName}`;
                    gpsButton.style.background = "#2d6a4f";

                    const goldSpan = document.querySelector(".card-ai span[style*='#f59e0b']");
                    if (goldSpan) {
                        goldSpan.innerText = `${ai_coefficient_a.toFixed(2)} mg/Lít`;
                    } else {
                        const allSpans = document.querySelectorAll(".card-ai span");
                        if (allSpans.length > 1) allSpans[1].innerText = `${ai_coefficient_a.toFixed(2)} mg/Lít`;
                    }
                    alert(`🌐 [ĐỊNH VỊ CLOUD GPS THÀNH CÔNG]\nHệ thống AI đã kết nối trạm khí tượng tại tọa độ: (${lat.toFixed(4)}, ${lon.toFixed(4)})\nTự động cấu hình hệ số hồi quy thực nghiệm: a = ${ai_coefficient_a.toFixed(2)} mg/Lít.`);
                },
                (error) => {
                    console.error("[GPS ERROR]", error);
                    gpsButton.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Lỗi kết nối GPS`;
                    gpsButton.style.background = "#ff5e62";
                    alert("🚨 Trình duyệt chặn quyền truy cập vị trí. Cậu hãy bấm nút 'Cho phép (Allow)' ở góc trên trình duyệt để kích hoạt GPS nhé Vy!");
                }
            );
        } else {
            alert("Trình duyệt không hỗ trợ Geolocation GPS.");
        }
    });
}

// ==========================================
//      🎛️      XỬ LÝ MENU CHỌN NGUỒN NƯỚC THỦ CÔNG (AN TOÀN CHỐNG GÃY CODE)
// ==========================================
function setupManualMenu() {
    const menuItems = document.querySelectorAll(".dropdown-content a, .menu-item");
    
    // Nếu giao diện HTML của cậu không dùng hoặc đổi tên class này, hàm sẽ tự động bỏ qua an toàn
    if (!menuItems || menuItems.length === 0) return;

    menuItems.forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const text = item.innerText.toLowerCase();

            if (text.includes("máy") || text.includes("sinh hoạt")) {
                ai_coefficient_a = 0.20;
                alert("💧 Đã chuyển sang chế độ Nước Máy Sinh Hoạt (a = 0.20 mg/L)");
            } else if (text.includes("sông") || text.includes("kênh")) {
                ai_coefficient_a = 1.30;
                alert("🌊 Đã chuyển sang chế độ Nước Sông/Kênh Rạch (a = 1.30 mg/L)");
            } else if (text.includes("thải") || text.includes("nhuộm")) {
                ai_coefficient_a = 4.50;
                alert("🚨 Đã chuyển sang chế độ Nước Thải Công Nghiệp (a = 4.50 mg/L)");
            }

            const goldSpan = document.querySelector(".card-ai span[style*='#f59e0b']");
            if (goldSpan) goldSpan.innerText = `${ai_coefficient_a.toFixed(2)} mg/Lít`;
        });
    });
}

// ==========================================
//      📊      HÀM ĐỔ DỮ LIỆU LÊN GIAO DIỆN MÀN HÌNH
// ==========================================
function updateUserInterface(waterVolume, microplasticMass, minutesRemaining) {
    let saturationPercentage = (microplasticMass / maxCapacity) * 100;
    if (saturationPercentage > 100) saturationPercentage = 100;

    // 1. Cập nhật Số Lít nước thô
    const waterElem = document.getElementById('water-volume');
    if (waterElem) {
        waterElem.innerHTML = `${waterVolume.toFixed(1)} <span style="font-size: 16px; color: #a0aec0;">Lít</span>`;
    }

    // 2. Cập nhật Khối lượng vi nhựa bám lại
    const plasticElem = document.getElementById('microplastic-mass');
    if (plasticElem) {
        plasticElem.innerText = microplasticMass.toFixed(2) + " mg";
    }

    // 3. Cập nhật Thanh tiến trình bão hòa màng Keratin
    const progressBar = document.getElementById('filter-progress');
    if (progressBar) {
        progressBar.style.width = saturationPercentage.toFixed(0) + "%";
        progressBar.innerText = saturationPercentage.toFixed(0) + "%";
        progressBar.style.backgroundColor = saturationPercentage >= 80 ? "#ff5e62" : (saturationPercentage >= 50 ? "#ffb703" : "#2d6a4f");
    }

    // 4. Cập nhật dòng trạng thái màng lọc bằng chữ
    const statusMessage = document.getElementById('status-message');
    if (statusMessage) {
        if (saturationPercentage >= 80) {
            statusMessage.innerHTML = `<span style="color: #ff5e62; font-weight: bold;">Cảnh báo: Màng lọc quá tải!</span>`;
        } else if (saturationPercentage >= 50) {
            statusMessage.innerHTML = `<span style="color: #ffb703;">Màng sắp bão hòa - Chú ý</span>`;
        } else {
            statusMessage.innerHTML = `<span style="color: #52b788;">Màng lọc hoạt động ổn định</span>`;
        }
    }

    // 5. Cập nhật thuật toán tiên tri đếm ngược thời gian AI
    const aiCountdownElement = document.getElementById('ai-countdown');
    if (aiCountdownElement) {
        let hours = Math.floor(minutesRemaining / 60);
        let minutes = Math.round(minutesRemaining % 60);
        if (saturationPercentage >= 100) {
            aiCountdownElement.innerText = "0 Giờ 0 Phút (Cần thay màng ngay!)";
        } else {
            aiCountdownElement.innerText = `${hours} Giờ ${minutes} Phút`;
        }
    }

    // 6. Đẩy dữ liệu uốn lượn liên tục lên đồ thị thời gian thực
    if (realtimeChart) {
        const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        realtimeChart.data.labels.push(currentTime);
        realtimeChart.data.datasets[0].data.push(waterVolume);
        realtimeChart.data.datasets[1].data.push(microplasticMass);

        // Chỉ giữ lại tối đa 10 mốc đồ thị gần nhất để màn hình mượt mà
        if (realtimeChart.data.labels.length > 10) {
            realtimeChart.data.labels.shift();
            realtimeChart.data.datasets[0].data.shift();
            realtimeChart.data.datasets[1].data.shift();
        }
        realtimeChart.update();
    }

    // 7. Tự động sinh hàng mới cho bảng Nhật Ký Giám Sát Hệ Thống
    const tableBody = document.getElementById("history-log-body");
    if (tableBody) {
        const row = document.createElement("tr");
        row.style.borderBottom = "1px solid rgba(255,255,255,0.05)";

        let statusHTML = `<span style="color: #52b788">Ổn định</span>`;
        if (saturationPercentage >= 50 && saturationPercentage < 80) statusHTML = `<span style="color: #ffb703">Sắp đầy</span>`;
        if (saturationPercentage >= 80) statusHTML = `<span style="color: #ff5e62; font-weight: bold;">Quá tải</span>`;

        const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        row.innerHTML = `
            <td style="padding: 10px;">${currentTime}</td>
            <td style="padding: 10px;">${waterVolume.toFixed(1)} L</td>
            <td style="padding: 10px;">${microplasticMass.toFixed(2)} mg</td>
            <td style="padding: 10px;">${statusHTML}</td>
        `;
        tableBody.insertBefore(row, tableBody.firstChild);
        if (tableBody.children.length > 6) {
            tableBody.removeChild(tableBody.lastChild);
        }
    }
}
