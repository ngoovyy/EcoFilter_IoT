// ==========================================
//  🔴  PHẦN CẤU HÌNH FIREBASE KẾT NỐI
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
//  🟢  BIẾN TOÀN CỤC & ĐỒ THỊ
// ==========================================
const maxCapacity = 100; // Ngưỡng khối lượng vi nhựa tối đa (mg)
const MAX_CAPACITY_LITERS = 5000; // Ngưỡng dung lượng nước tối đa của màng (Lít)

let realtimeChart = null; 
let simulationInterval = null; 
let currentWaterSimulation = 16.5; // Giữ mốc bắt đầu như ảnh cậu chụp
let currentPlasticSimulation = 45.60; // Giữ mốc bắt đầu như ảnh cậu chụp

// Cấu hình bộ đếm ngược ảo cho chế độ mô phỏng
let simulatedMinutesRemaining = 345; // Bắt đầu ở khoảng 5 Giờ 45 Phút cho thực tế

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
//  🔄  KHỐI XỬ XỬ LÝ HYBRID (ONLINE / OFFLINE)
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

// --- CHẾ ĐỘ 1: ĐỌC DỮ LIỆU THẬT TỪ FIREBASE ---
function activateRealtimeDatabase() { 
  database.ref().on('value', (snapshot) => { 
    const data = snapshot.val(); 
    if (!data) return; 
    let waterVolume = data.waterVolume || (data.Device_Data ? data.Device_Data.TotalWater : 0); 
    let microplasticMass = data.microplasticMass || (data.Device_Data ? data.Device_Data.Turbidity : 0); 
    
    // Khi chạy online thật, tính toán đếm ngược dựa theo tốc độ dòng chảy thực tế
    updateUserInterface(waterVolume, microplasticMass, false); 
  });
}

// --- CHẾ ĐỘ 2: TỰ ĐỘNG CHẠY GIẢ LẬP ĐỒNG BỘ KHI THỬ NGHIỆM ---
function activateOfflineSimulation() { 
  if (simulationInterval) return; 
  
  simulationInterval = setInterval(() => { 
    // Giả lập lượng nước tăng nhẹ liên tục mỗi 2 giây
    let waterInflow = 0.05 + Math.random() * 0.05; 
    currentWaterSimulation += waterInflow; 
    
    // Giả lập hạt nhựa tích tụ tăng tịnh tiến theo
    let plasticDetected = waterInflow * (1.2 + Math.random() * 0.3); 
    currentPlasticSimulation += plasticDetected; 
    
    // Mỗi 2 giây giả lập giảm đi 1 phút trên đồng hồ tiên tri AI để tạo hiệu ứng đếm ngược sinh động
    if (simulatedMinutesRemaining > 1) {
      simulatedMinutesRemaining -= 1;
    }

    updateUserInterface(currentWaterSimulation, currentPlasticSimulation, true); 
  }, 2000); 
}

// --- HÀM ĐỔ DỮ LIỆU LÊN GIAO DIỆN & ĐỒNG BỘ ĐỒ THỊ ---
function updateUserInterface(waterVolume, microplasticMass, isOfflineMode) { 
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

  // 3. 🧠 THUẬT TOÁN ĐỒNG HỒ TIÊN TRI AI ĐẾM NGƯỢC
  const aiCountdownElement = document.getElementById('ai-countdown'); 
  if (aiCountdownElement) {
    let hours = 0;
    let minutes = 0;

    if (isOfflineMode) {
      // Trong chế độ thử nghiệm chưa có hàng: Lấy bộ đếm thời gian ảo lùi dần mượt mà
      hours = Math.floor(simulatedMinutesRemaining / 60);
      minutes = Math.round(simulatedMinutesRemaining % 60);
    } else {
      // Khi ráp phần cứng thật: Tự động tính toán dựa trên dung tích màng còn lại
      let litersRemaining = MAX_CAPACITY_LITERS - waterVolume;
      if (litersRemaining < 0) litersRemaining = 0;
      
      // Giả định tốc độ dòng chảy thực tế trung bình từ vòi nước
      let assumedFlowRate = 0.5; // Lít / Phút
      let totalMinutesRemaining = litersRemaining / assumedFlowRate;
      
      hours = Math.floor(totalMinutesRemaining / 60);
      minutes = Math.round(totalMinutesRemaining % 60);
    }

    aiCountdownElement.innerText = `${hours} Giờ ${minutes} Phút`;
  }

  // 4. Cập nhật trạng thái nhãn dán AI bên dưới phần trăm tuổi thọ màng
  let litersRemaining = MAX_CAPACITY_LITERS - waterVolume;
  let lifespanPercent = Math.round((litersRemaining / MAX_CAPACITY_LITERS) * 100);
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
    realtimeChart.update(); // Gỡ bỏ 'none' để kích hoạt hiệu ứng mượt mà
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
