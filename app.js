// ==========================================
// 🔴 PHẦN DÁN MỚI: CẤU HÌNH FIREBASE KẾT NỐI
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
 
// Khởi tạo Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
 
// ==========================================
// 🟢 PHẦN CODE XỬ LÝ ĐỒ THỊ VÀ LOGIC
// ==========================================
const maxCapacity = 100; // Hạn mức tối đa màng lọc chịu được (100mg)
let realtimeChart;

// Đảm bảo giao diện tải xong mới chạy Chart
document.addEventListener("DOMContentLoaded", () => {
    const canvasElement = document.getElementById('realtimeChart');
    if (!canvasElement) return;
    
    const ctx = canvasElement.getContext('2d');
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
                    pointRadius: 2,
                    tension: 0.3, 
                    yAxisID: 'yWater'
                },
                {
                    label: 'Vi nhựa giữ lại (mg)',
                    data: [],
                    borderColor: '#ff5e62', 
                    backgroundColor: 'rgba(255, 94, 98, 0.05)',
                    borderWidth: 3,
                    pointRadius: 2,
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
            },
            plugins: {
                legend: {
                    labels: { color: '#e2e8f0', font: { size: 12 } }
                }
            }
        }
    });

    // Kích hoạt lắng nghe Firebase sau khi đồ thị đã khởi tạo thành công
    initFirebaseListener();
});
 
// 🔄 2. HÀM LẮNG NGHE DỮ LIỆU THỜI GIAN THỰC TỪ FIREBASE
function initFirebaseListener() {
    database.ref().on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
     
        let waterVolume = data.waterVolume || 0;
        let microplasticMass = data.microplasticMass || 0;
     
        // Tính toán tỷ lệ phần trăm bão hòa
        let saturationPercentage = (microplasticMass / maxCapacity) * 100;
        if (saturationPercentage > 100) saturationPercentage = 100;
     
        // Cập nhật số liệu hiển thị (Đã sửa ID chuẩn theo index.html)
        if(document.getElementById('water-flow')) {
            document.getElementById('water-flow').innerHTML = `${waterVolume.toFixed(1)} <span class="unit">Lít</span>`;
        }
        if(document.getElementById('turbidity-status')) {
            document.getElementById('turbidity-status').innerText = microplasticMass.toFixed(1) + " mg";
        }
     
        // Xử lý thanh tiến trình thông minh (Nếu có trên HTML)
        const progressBar = document.getElementById('filter-progress');
        const statusMessage = document.getElementById('status-message');
     
        if (progressBar && statusMessage) {
            progressBar.style.width = saturationPercentage.toFixed(0) + "%";
            progressBar.innerText = saturationPercentage.toFixed(0) + "%";
     
            if (saturationPercentage >= 80) {
                progressBar.style.backgroundColor = "#ff5e62"; 
                statusMessage.innerHTML = `<span style="color: #ff5e62; font-weight: bold;">🚨 Cảnh báo: Màng lọc quá tải!</span>`;
            } else if (saturationPercentage >= 50) {
                progressBar.style.backgroundColor = "#ffb703"; 
                statusMessage.innerHTML = `<span style="color: #ffb703;">⚠️ Cảnh báo: Màng lọc sắp đầy</span>`;
            } else {
                progressBar.style.backgroundColor = "#2d6a4f"; 
                statusMessage.innerHTML = `<span style="color: #52b788;">Màng lọc hoạt động ổn định</span>`;
            }
        }
     
        // CẬP NHẬT BIỂU ĐỒ THEO THỜI GIAN THỰC
        if (realtimeChart) {
            const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
         
            realtimeChart.data.labels.push(currentTime);
            realtimeChart.data.datasets[0].data.push(waterVolume);
            realtimeChart.data.datasets[1].data.push(microplasticMass);
         
            if (realtimeChart.data.labels.length > 12) {
                realtimeChart.data.labels.shift();
                realtimeChart.data.datasets[0].data.shift();
                realtimeChart.data.datasets[1].data.shift();
            }
            realtimeChart.update('none');
        }
     
        // TỰ ĐỘNG THÊM DÒNG VÀO BẢNG NHẬT KÝ
        const tableBody = document.getElementById("history-log-body");
        if (tableBody) {
            const row = document.createElement("tr");
            row.style.borderBottom = "1px solid #2c3e50";
            
            let statusHTML = `<span style="color: #52b788">Ổn định</span>`;
            if (saturationPercentage >= 50 && saturationPercentage < 80) statusHTML = `<span style="color: #ffb703">Sắp đầy</span>`;
            if (saturationPercentage >= 80) statusHTML = `<span style="color: #ff5e62; font-weight: bold;">Quá tải</span>`;
     
            const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            row.innerHTML = `
                <td style="padding: 10px;">${currentTime}</td>
                <td style="padding: 10px;">${waterVolume.toFixed(1)} L</td>
                <td style="padding: 10px;">${microplasticMass.toFixed(1)} mg</td>
                <td style="padding: 10px;">${statusHTML}</td>
            `;
     
            tableBody.insertBefore(row, tableBody.firstChild);
            if (tableBody.children.length > 8) {
                tableBody.removeChild(tableBody.lastChild);
            }
        }
    });
}
 
// ==========================================
// 🚀 3. HÀM GIẢ LẬP CẢM BIẾN IOT CHẠY TỰ ĐỘNG (BẬT KHI TEST WEB)
// ==========================================
function startSensorSimulation() {
    let currentWater = 15.5; 
    let currentPlastic = 42.8;
 
    setInterval(() => {
        let waterInflow = 0.05 + Math.random() * 0.1;
        currentWater += waterInflow;
 
        let plasticDetected = waterInflow * (2.5 + Math.random() * 0.4);
        currentPlastic += plasticDetected;
 
        database.ref('/').update({
            waterVolume: parseFloat(currentWater.toFixed(1)),
            microplasticMass: parseFloat(currentPlastic.toFixed(1))
        });
    }, 2000);
}
 
// Kích hoạt giả lập chạy tự động để test giao diện
startSensorSimulation();