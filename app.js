// ==========================================
//   🔴   PHẦN CẤU HÌNH FIREBASE KẾT NỐI
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
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();

// ==========================================
//   🟢   BIẾN TOÀN CỤC & ĐỒ THỊ
// ==========================================
const maxCapacity = 100; // Ngưỡng khối lượng vi nhựa bão hòa tối đa (mg)
let realtimeChart = null; 
let simulationInterval = null; 

// Biến lưu trữ lịch sử để tính toán tốc độ tích tụ vi nhựa theo thời gian thực
let lastPlasticMass = 0;
let lastTimestamp = Date.now();
let estimatedMinutesLeft = 345; // Mặc định ban đầu khoảng 5 Giờ 45 Phút phòng hờ

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
        x: { grid: { color: 'rgba(255, 255, 255, 0.03)' }, ticks: { color: '#a0aec0' } },
        yWater: {
          type: 'linear', position: 'left',
          title: { display: true, text: 'Lít', color: '#00ffb7', font: { weight: 'bold' } },
          grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#a0aec0' }
        },
        yPlastic: {
          type: 'linear', position: 'right',
          title: { display: true, text: 'mg', color: '#ff5e62', font: { weight: 'bold' } },
          grid: { display: false }, ticks: { color: '#a0aec0' }
        }
      },
      plugins: { legend: { labels: { color: '#e2e8f0', font: { size: 12 } } } }
    }
  });

  // KÍCH HOẠT HỆ THỐNG KIỂM TRA MẠNG HYBRID
  initHybridSystem();
});

// ==========================================
//   🔄   KHỐI XỬ XỬ LÝ HYBRID (ONLINE / OFFLINE)
// ==========================================
function initHybridSystem() {
  const connectedRef = database.ref(".info/connected");
  connectedRef.on("value", (snap) => {
    if (snap.val() === true) {
      console.log("[HYBRID SYSTEM] 🌐 Đang chạy chế độ ONLINE");
      if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
      }
      activateRealtimeDatabase();
    } else {
      console.log("[HYBRID SYSTEM] 🚨 MẤT MẠNG! Tự động chạy OFFLINE SIMULATION");
      const statusMessage = document.getElementById('status-message');
      if (statusMessage) {
        statusMessage.innerHTML = `<span style="color: #52b788;">Màng lọc hoạt động ổn định</span>`;
      }
      activateOfflineSimulation();
    }
  });
}

// --- CHẾ ĐỘ 1: ĐỌC DỮ LIỆU THẬT TỪ FIREBASE ONLINE ---
function activateRealtimeDatabase() {
  database.ref().on('value', (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    
    let waterVolume = data.waterVolume !== undefined ? data.waterVolume : 16.5;
    let microplasticMass = data.microplasticMass !== undefined ? data.microplasticMass : 45.6;

    // --- 🧠 THUẬT TOÁN TIÊN TRI AI THỜI GIAN THỰC ĐỒNG BỘ MẠCH ---
    let now = Date.now();
    let timePassedMinutes = (now - lastTimestamp) / 60000; // Quy ra phút
    
    if (timePassedMinutes > 0 && microplasticMass > lastPlasticMass && lastPlasticMass > 0) {
      // Tính tốc độ bám hạt nhựa thực tế (mg/phút)
      let accumulationRate = (microplasticMass - lastPlasticMass) / timePassedMinutes;
      
      // Dự đoán số phút còn lại dựa trên khối lượng vi nhựa còn lại trước khi bão hòa (100mg)
      let plasticRemaining = maxCapacity - microplasticMass;
      if (plasticRemaining < 0) plasticRemaining = 0;
      
      if (accumulationRate > 0) {
        estimatedMinutesLeft = plasticRemaining / accumulationRate;
      }
    }
    
    // Lưu lại trạng thái để tính toán cho chu kỳ tiếp theo
    lastPlasticMass = microplasticMass;
    lastTimestamp = now;

    // Cập nhật giao diện với số liệu từ mạch gửi lên
    updateUserInterface(waterVolume, microplasticMass, estimatedMinutesLeft);
  });
}

// --- CHẾ ĐỘ 2: TỰ ĐỘNG CHẠY GIẢ LẬP KHI CHƯA MỞ WIFI ĐIỆN THOẠI ---
function activateOfflineSimulation() {
  if (simulationInterval) return;
  
  let currentWaterSimulation = 16.5;
  let currentPlasticSimulation = 45.6;
  let simulatedMinutesRemaining = 345; // 5 Giờ 45 Phút dự kiến ban đầu

  simulationInterval = setInterval(() => {
    let waterInflow = 0.05 + Math.random() * 0.05;
    currentWaterSimulation += waterInflow;

    let plasticDetected = waterInflow * (1.2 + Math.random() * 0.3);
    currentPlasticSimulation += plasticDetected;

    if (simulatedMinutesRemaining > 1) {
      simulatedMinutesRemaining -= 1; // Đếm lùi mượt mà từng phút một
    }
    
    updateUserInterface(currentWaterSimulation, currentPlasticSimulation, simulatedMinutesRemaining);
  }, 2000);
}

// --- HÀM ĐỔ DỮ LIỆU LÊN GIAO DIỆN & ĐỒNG BỘ ĐỒ THỊ ---
function updateUserInterface(waterVolume, microplasticMass, minutesRemaining) {
  let saturationPercentage = (microplasticMass / maxCapacity) * 100;
  if (saturationPercentage > 100) saturationPercentage = 100;

  // 1. Cập nhật các ô số liệu văn bản chính
  if (document.getElementById('water-volume')) {
    document.getElementById('water-volume').innerHTML = `${waterVolume.toFixed(1)} <span style="font-size: 16px; color: #a0aec0;">Lít</span>`;
  }
  if (document.getElementById('microplastic-mass')) {
    document.getElementById('microplastic-mass').innerText = microplasticMass.toFixed(2) + " mg";
  }

  // 2. Cập nhật Thanh tiến trình bão hòa (%)
  const progressBar = document.getElementById('filter-progress');
  if (progressBar) {
    progressBar.style.width = saturationPercentage.toFixed(0) + "%";
    progressBar.innerText = saturationPercentage.toFixed(0) + "%";
    progressBar.style.backgroundColor = saturationPercentage >= 80 ? "#ff5e62" : (saturationPercentage >= 50 ? "#ffb703" : "#2d6a4f");
  }

  // 3. XỬ LÝ ĐỒNG HỒ ĐẾM NGƯỢC AI
  const aiCountdownElement = document.getElementById('ai-countdown');
  if (aiCountdownElement) {
    let hours = Math.floor(minutesRemaining / 60);
    let minutes = Math.round(minutesRemaining % 60);
    
    if (saturationPercentage >= 100) {
      aiCountdownElement.innerText = "0 Giờ 0 Phút (Cần thay màng!)";
    } else {
      aiCountdownElement.innerText = `${hours} Giờ ${minutes} Phút`;
    }
  }

  // 4. Cập nhật nhãn trạng thái tuổi thọ màng
  let lifespanPercent = Math.round(100 - saturationPercentage);
  const aiStatusElement = document.getElementById('filter-status');
  if (aiStatusElement) {
    if (lifespanPercent > 50) {
      aiStatusElement.innerText = `An toàn (${lifespanPercent}%)`;
      aiStatusElement.className = "status-good";
    } else if (lifespanPercent <= 50 && lifespanPercent > 15) {
      aiStatusElement.innerText = `Chú ý (${lifespanPercent}%)`;
      aiStatusElement.className = "status-warning";
    } else {
      aiStatusElement.innerText = `Sắp bão hòa! (${lifespanPercent}%)`;
      aiStatusElement.className = "status-danger";
    }
  }

  // 5. Vẽ đồ thị thời gian thực uốn lượn liên tục
  if (realtimeChart) {
    const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    realtimeChart.data.labels.push(currentTime);
    realtimeChart.data.datasets[0].data.push(waterVolume);
    realtimeChart.data.datasets[1].data.push(microplasticMass);

    if (realtimeChart.data.labels.length > 10) {
      realtimeChart.data.labels.shift();
      realtimeChart.data.datasets[0].data.shift();
      realtimeChart.data.datasets[1].data.shift();
    }
    realtimeChart.update();
  }

  // 6. Tự động thêm hàng mới tinh vào Realtime Nhật ký hệ thống
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
      <td style="padding: 10px;">${microplasticMass.toFixed(2)} mg</td>
      <td style="padding: 10px;">${statusHTML}</td>
    `;
    tableBody.insertBefore(row, tableBody.firstChild);
    if (tableBody.children.length > 6) {
      tableBody.removeChild(tableBody.lastChild);
    }
  }
}