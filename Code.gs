/**
 * ==========================================================================
 * TAPAK LEBAK - SISTEM INFORMASI PEMBINAAN KADER
 * DPD PKS KABUPATEN LEBAK
 * ==========================================================================
 * Backend Google Apps Script (GAS)
 * File: Code.gs
 * Version: 1.0.0
 * 
 * Fitur:
 * 1. Web App Server (doGet) dengan dukungan responsive viewport & HTML template
 * 2. Inisialisasi Database Otomatis (initDatabase) ke tab Google Sheet
 * 3. Master Data 28 Kecamatan se-Kabupaten Lebak & 6 Daerah Pemilihan (Dapil)
 * 4. API CRUD Kader, UPA (Unit Pembinaan Anggota), Agenda & Presensi Realtime
 * 5. Pencatatan Mutaba'ah Yaumiyah & Evaluasi Kader
 * 6. Ekspor / Impor data & Statistik Eksekutif DPD
 * ==========================================================================
 */

// Konstanta Nama Sheet
const SHEETS = {
  KADER: 'DB_KADER',
  UPA: 'DB_UPA',
  AGENDA: 'DB_AGENDA',
  PRESENSI: 'DB_PRESENSI',
  MUTABAAH: 'DB_MUTABAAH',
  USERS: 'DB_USERS',
  WILAYAH: 'DB_WILAYAH',
  CONFIG: 'DB_CONFIG',
  REKRUTMEN: 'DB_REKRUTMEN',
  MUTASI: 'DB_MUTASI',
  LAPORAN_BKAP: 'DB_LAPORAN_BKAP'
};

// Konfigurasi Aplikasi & Logo Google Drive
// ID Spreadsheet Database Resmi TAPAK LEBAK (DPD PKS Lebak)
const SPREADSHEET_ID = '1ZdB8OpZE8ND8azeU0HRugVbRf70b7JuQAvFOodmPFeo';

/**
 * Universal Spreadsheet Accessor
 * Mendukung Container-Bound script maupun Standalone Web App deployment
 * Memastikan data tersambung 100% ke Google Spreadsheet riil tanpa error active spreadsheet
 */
function getSpreadsheet() {
  // Prioritas Utama: Buka langsung ID Spreadsheet Database Resmi (749 Kader)
  if (SPREADSHEET_ID) {
    try {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      if (ss && ss.getId()) return ss;
    } catch (e) {
      Logger.log('Gagal openById SPREADSHEET_ID: ' + e.message);
    }
  }

  // Cek jika ID tersimpan di Script Properties
  try {
    const propId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (propId) {
      return SpreadsheetApp.openById(propId);
    }
  } catch (e) {
    Logger.log('ScriptProperties read error: ' + e.message);
  }

  // Fallback jika container-bound script
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active && active.getId()) return active;
  } catch (e) {
    Logger.log('Active spreadsheet context not available: ' + e.message);
  }
  
  throw new Error('Spreadsheet ID belum dikonfigurasi!');
}

const APP_CONFIG = {
  APP_NAME: 'TAPAK LEBAK - DPD PKS Kabupaten Lebak',
  TAGLINE: 'Sistem Informasi Pembinaan Kader Terintegrasi',
  LOGO_DRIVE_ID: '1Q-h0oEOhTQIIVVbma2Ckf2fr6ETEWb5t',
  LOGO_PRIMARY: 'https://lh3.googleusercontent.com/d/1Q-h0oEOhTQIIVVbma2Ckf2fr6ETEWb5t',
  LOGO_FALLBACK: 'https://drive.google.com/thumbnail?id=1Q-h0oEOhTQIIVVbma2Ckf2fr6ETEWb5t&sz=w1000',
  LOGO_RAW: 'https://drive.google.com/uc?export=view&id=1Q-h0oEOhTQIIVVbma2Ckf2fr6ETEWb5t',
  TAPAK_LOGO_DRIVE_ID: '1Q-h0oEOhTQIIVVbma2Ckf2fr6ETEWb5t',
  TAPAK_LOGO_PRIMARY: 'https://lh3.googleusercontent.com/d/1Q-h0oEOhTQIIVVbma2Ckf2fr6ETEWb5t',
  BANNER_HERO_URL: '',
  VERSION: '1.3.3'
};

/**
 * Helper: Normalisasi berbagai format URL Google Drive atau File ID menjadi Direct Rendering Link (lh3)
 * @param {string} input - Bisa berupa URL sharing, URL view, URL uc/thumbnail, atau File ID murni
 * @return {Object} { directUrl, fallbackUrl, driveId, rawInput }
 */
function normalizeDriveImageUrl(input) {
  if (!input || typeof input !== 'string') {
    return {
      directUrl: APP_CONFIG.LOGO_PRIMARY,
      fallbackUrl: APP_CONFIG.LOGO_FALLBACK,
      driveId: APP_CONFIG.LOGO_DRIVE_ID
    };
  }

  const str = input.trim();

  // Jika berupa Base64 DataURL (misal pratinjau lokal offline)
  if (str.startsWith('data:image/')) {
    return { directUrl: str, fallbackUrl: str, driveId: '' };
  }

  let driveId = '';

  // 1. Format: https://drive.google.com/file/d/{ID}/view...
  const matchFileD = str.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (matchFileD && matchFileD[1]) {
    driveId = matchFileD[1];
  }

  // 2. Format: https://drive.google.com/open?id={ID} atau ?id={ID}
  if (!driveId) {
    const matchQueryId = str.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
    if (matchQueryId && matchQueryId[1]) {
      driveId = matchQueryId[1];
    }
  }

  // 3. Format: https://lh3.googleusercontent.com/d/{ID}
  if (!driveId) {
    const matchLh3 = str.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]{20,})/);
    if (matchLh3 && matchLh3[1]) {
      driveId = matchLh3[1];
    }
  }

  // 4. Jika input berupa File ID murni (panjang >= 20 karakter alfanumerik)
  if (!driveId && /^[a-zA-Z0-9_-]{20,}$/.test(str)) {
    driveId = str;
  }

  if (driveId) {
    return {
      directUrl: 'https://lh3.googleusercontent.com/d/' + driveId,
      fallbackUrl: 'https://drive.google.com/thumbnail?id=' + driveId + '&sz=w800',
      driveId: driveId
    };
  }

  // Jika URL web biasa
  return {
    directUrl: str,
    fallbackUrl: str,
    driveId: ''
  };
}

// Konfigurasi Folder Google Drive untuk Upload Otomatis
const DRIVE_CONFIG = {
  PARENT_FOLDER: 'TAPAK LEBAK_DPD_PKS_LEBAK_UPLOADS',
  SUBFOLDERS: {
    BRANDING: 'Branding_Logo_Banner',
    KADER: 'Foto_Kader',
    AGENDA: 'Dokumentasi_Agenda',
    MUTABAAH: 'Bukti_Mutabaah'
  }
};

// Master Data 28 Kecamatan Kabupaten Lebak beserta Dapil (Sesuai PKPU No. 6 Tahun 2023)
const KECAMATAN_LEBAK = [
  // Dapil 1 (4 Kecamatan)
  { nama: 'Rangkasbitung', dapil: 'Dapil 1', targetKader: 350 },
  { nama: 'Cibadak', dapil: 'Dapil 1', targetKader: 220 },
  { nama: 'Kalanganyar', dapil: 'Dapil 1', targetKader: 150 },
  { nama: 'Warunggunung', dapil: 'Dapil 1', targetKader: 200 },

  // Dapil 2 (5 Kecamatan)
  { nama: 'Maja', dapil: 'Dapil 2', targetKader: 250 },
  { nama: 'Curugbitung', dapil: 'Dapil 2', targetKader: 130 },
  { nama: 'Sajira', dapil: 'Dapil 2', targetKader: 160 },
  { nama: 'Cipanas', dapil: 'Dapil 2', targetKader: 180 },
  { nama: 'Lebakgedong', dapil: 'Dapil 2', targetKader: 110 },

  // Dapil 3 (6 Kecamatan)
  { nama: 'Cimarga', dapil: 'Dapil 3', targetKader: 190 },
  { nama: 'Leuwidamar', dapil: 'Dapil 3', targetKader: 170 },
  { nama: 'Muncang', dapil: 'Dapil 3', targetKader: 140 },
  { nama: 'Sobang', dapil: 'Dapil 3', targetKader: 120 },
  { nama: 'Bojongmanik', dapil: 'Dapil 3', targetKader: 110 },
  { nama: 'Cirinten', dapil: 'Dapil 3', targetKader: 100 },

  // Dapil 4 (5 Kecamatan)
  { nama: 'Bayah', dapil: 'Dapil 4', targetKader: 210 },
  { nama: 'Cibeber', dapil: 'Dapil 4', targetKader: 150 },
  { nama: 'Cihara', dapil: 'Dapil 4', targetKader: 120 },
  { nama: 'Cilograng', dapil: 'Dapil 4', targetKader: 140 },
  { nama: 'Panggarangan', dapil: 'Dapil 4', targetKader: 130 },

  // Dapil 5 (4 Kecamatan)
  { nama: 'Malingping', dapil: 'Dapil 5', targetKader: 240 },
  { nama: 'Wanasalam', dapil: 'Dapil 5', targetKader: 180 },
  { nama: 'Cijaku', dapil: 'Dapil 5', targetKader: 120 },
  { nama: 'Cigemblong', dapil: 'Dapil 5', targetKader: 90 },

  // Dapil 6 (4 Kecamatan)
  { nama: 'Banjarsari', dapil: 'Dapil 6', targetKader: 160 },
  { nama: 'Cileles', dapil: 'Dapil 6', targetKader: 130 },
  { nama: 'Cikulur', dapil: 'Dapil 6', targetKader: 140 },
  { nama: 'Gunungkencana', dapil: 'Dapil 6', targetKader: 140 }
];

const JENJANG_KADER = ['Pemula', 'Muda', 'Pratama', 'Madya', 'Dewasa', 'Utama', 'Ahli'];

/**
 * Endpoint Utama Web App (doGet)
 */
function doGet(e) {
  try {
    return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('TAPAK LEBAK - DPD PKS Kabupaten Lebak')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return HtmlService.createHtmlOutput('<h3>Error loading TAPAK LEBAK: ' + err.toString() + '</h3>');
  }
}

/**
 * Helper untuk include file di Apps Script
 */


/**
 * Endpoint POST Web App (doPost)
 * Mendukung request JSON eksternal / REST API untuk CRUD data
 */
function doPost(e) {
  try {
    let requestData = {};
    if (e && e.postData && e.postData.contents) {
      requestData = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      requestData = e.parameter;
    }
    
    const action = requestData.action || (e && e.parameter && e.parameter.action);
    let result = { status: 'error', message: 'Action tidak dikenal' };

    switch (action) {
      case 'getInitialData':
        result = apiGetInitialData(true);
        break;
      case 'saveKader':
        result = apiSaveKader(requestData.data);
        break;
      case 'deleteKader':
        result = apiDeleteKader(requestData.id);
        break;
      case 'saveUPA':
        result = apiSaveUPA(requestData.data);
        break;
      case 'deleteUPA':
        result = apiDeleteUPA(requestData.id);
        break;
      case 'saveAgenda':
        result = apiSaveAgenda(requestData.data);
        break;
      case 'deleteAgenda':
        result = apiDeleteAgenda(requestData.id);
        break;
      case 'submitPresensi':
      case 'savePresensi':
        result = apiSubmitPresensi(requestData.agendaId, requestData.attendanceRecords || requestData.data, requestData.gpsData);
        break;
      case 'saveWilayah':
        result = apiSaveWilayah(requestData.data);
        break;
      case 'deleteWilayah':
        result = apiDeleteWilayah(requestData.id);
        break;
      case 'saveRekrutmen':
        result = apiSaveRekrutmen(requestData.data || requestData);
        break;
      case 'deleteRekrutmen':
        result = apiDeleteRekrutmen(requestData.id);
        break;
      case 'saveMutasi':
        result = apiSaveMutasi(requestData.data || requestData);
        break;
      case 'approveMutasi':
        result = apiApproveMutasi(requestData.id, requestData.statusApproval);
        break;
      case 'deleteMutasi':
        result = apiDeleteMutasi(requestData.id);
        break;
      case 'saveLaporanBKAP':
        result = apiSaveLaporanBKAP(requestData.data || requestData);
        break;
      case 'deleteLaporanBKAP':
        result = apiDeleteLaporanBKAP(requestData.id);
        break;
      case 'saveMutabaah':
        result = apiSaveMutabaah(requestData.data || requestData);
        break;
      case 'initDatabase':
        result = initDatabase();
        break;
      default:
        result = { status: 'error', message: 'Aksi ' + action + ' belum didukung via doPost' };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Inisialisasi Seluruh Spreadsheet Database beserta Data Awal (Seeding)
 * Jalankan fungsi ini sekali saat pertama kali menghubungkan Sheet.
 */
function initDatabase() {
  const ss = getSpreadsheet();
  
  // 1. Sheet DB_KADER
  setupSheet(ss, SHEETS.KADER, [
    'ID', 'NIK_KTA', 'Nama', 'JK', 'NoWA', 'Kecamatan', 'Desa', 'UPA_ID', 'Jenjang', 'Status', 'Foto', 'DibuatPada'
  ], [
    ['KDR-001', '3602101001920001', 'Murobbi', 'Ikhwan', '081234567890', 'Rangkasbitung', 'Muara Ciujung Timur', 'UPA-001', 'Madya', 'Aktif', '', new Date()],
    ['KDR-002', '3602102505950002', 'H. Muhammad Rizqi, M.T.', 'Ikhwan', '081298765432', 'Cibadak', 'Asem', 'UPA-001', 'Pratama', 'Aktif', '', new Date()],
    ['KDR-003', '3602101211980003', 'Kader', 'Ikhwan', '085712345678', 'Warunggunung', 'Selaraja', 'UPA-001', 'Muda', 'Aktif', '', new Date()],
    ['KDR-004', '3602101908900004', 'Usth. Siti Khadijah, S.Ag', 'Akhwat', '087812345678', 'Rangkasbitung', 'Cijoro Lebak', 'UPA-002', 'Madya', 'Aktif', '', new Date()],
    ['KDR-005', '3602100407990005', 'Nurul Aini, S.Si', 'Akhwat', '081398765432', 'Kalanganyar', 'Sukamekarsari', 'UPA-002', 'Muda', 'Aktif', '', new Date()],
    ['KDR-006', '3602101503930006', 'Dedi Supriyadi', 'Ikhwan', '085211223344', 'Malingping', 'Malingping Utara', 'UPA-003', 'Pratama', 'Aktif', '', new Date()],
    ['KDR-007', '3602102209970007', 'Irfan Hakim, S.T.', 'Ikhwan', '081900998877', 'Bayah', 'Bayah Barat', 'UPA-003', 'Muda', 'Aktif', '', new Date()],
    ['KDR-008', '3602100802000008', 'Rizka Maulida, S.Pd', 'Akhwat', '089611223344', 'Cipanas', 'Hargasari', 'UPA-004', 'Pemula', 'Aktif', '', new Date()]
  ]);

  // 2. Sheet DB_UPA
  setupSheet(ss, SHEETS.UPA, [
    'ID', 'NamaUPA', 'Pembimbing', 'Jenjang', 'Jadwal', 'Kecamatan', 'Kategori', 'DibuatPada'
  ], [
    ['UPA-001', 'UPA Al-Fatih 1', 'Murobbi', 'Muda - Pratama', 'Ahad, 06.00 WIB', 'Rangkasbitung', 'Ikhwan', new Date()],
    ['UPA-002', 'UPA Khadijah 1', 'Usth. Siti Khadijah, S.Ag', 'Muda - Pratama', 'Sabtu, 16.00 WIB', 'Rangkasbitung', 'Akhwat', new Date()],
    ['UPA-003', 'UPA Shalahuddin 1', 'Ust. Lukman Hakim', 'Pemula - Muda', 'Ahad, 08.00 WIB', 'Malingping', 'Ikhwan', new Date()],
    ['UPA-004', 'UPA Aisyah 1', 'Usth. Wardah Fauziyah', 'Pemula - Muda', 'Jumat, 16.00 WIB', 'Cipanas', 'Akhwat', new Date()]
  ]);

  // 3. Sheet DB_AGENDA
  setupSheet(ss, SHEETS.AGENDA, [
    'ID', 'NamaAgenda', 'Kategori', 'Tanggal', 'Waktu', 'Lokasi', 'Tingkat', 'Status', 'Catatan', 'DibuatPada'
  ], [
    ['AGD-001', 'Liqo Rutin Pekanan UPA Al-Fatih', 'Liqo UPA', '2026-09-13', '06:00 - 08:00', 'Masjid Agung Al-A\'raf Rangkasbitung', 'UPA', 'Mendatang', 'Materi: Komitmen Tarbiyah & Dakwah', new Date()],
    ['AGD-002', 'Daurah Marhalah Pemula (DMP) Lebak', 'Daurah', '2026-09-20', '08:00 - 15:30', 'Aula DPD PKS Lebak', 'DPD', 'Mendatang', 'Wajib bagi kader pemula seluruh DPC', new Date()],
    ['AGD-003', 'Ta\'lim Bulanan Kader Se-Kabupaten Lebak', 'Ta\'lim Bulanan', '2026-09-27', '08:30 - 12:00', 'Gedung PGRI Rangkasbitung', 'DPD', 'Mendatang', 'Narasumber: DPP / DPW PKS Banten', new Date()],
    ['AGD-004', 'Kemah Bakti Nusantara (Kembara)', 'Kembara', '2026-10-10', '07:00 - Selesai', 'Bumi Perkemahan Cimarga', 'DPD', 'Direncanakan', 'Pembinaan fisik dan wawasan kebangsaan', new Date()]
  ]);

  // 4. Sheet DB_PRESENSI (Didukung GPS Geolocation Tracking & Geofencing)
  setupSheet(ss, SHEETS.PRESENSI, [
    'ID', 'AgendaID', 'KaderID', 'Tanggal', 'Status', 'Keterangan', 'DibuatPada', 'Latitude', 'Longitude', 'Akurasi', 'StatusGeofence', 'AlamatLokasi'
  ], [
    ['PRS-001', 'AGD-001', 'KDR-001', '2026-09-06', 'Hadir', 'Tepat waktu', new Date(), -6.3547, 106.2483, 10, 'Di Lokasi', 'Masjid Agung Al-A\'raf Rangkasbitung'],
    ['PRS-002', 'AGD-001', 'KDR-002', '2026-09-06', 'Hadir', 'Tepat waktu', new Date(), -6.3551, 106.2490, 15, 'Di Lokasi', 'Area Alun-alun Rangkasbitung'],
    ['PRS-003', 'AGD-001', 'KDR-003', '2026-09-06', 'Izin', 'Tugas kerja luar kota', new Date(), -6.2115, 106.8452, 25, 'Luar Radius', 'Jakarta Selatan']
  ]);

  // 5. Sheet DB_MUTABAAH
  setupSheet(ss, SHEETS.MUTABAAH, [
    'ID', 'KaderID', 'BulanTahun', 'TilawahJuz', 'SholatJamaahPersen', 'QiyamulLailHari', 'ShaumSunnahHari', 'InfaqRupiah', 'CatatanPembimbing', 'SkorTotal', 'DibuatPada'
  ], [
    ['MTB-001', 'KDR-001', '2026-08', 30, 95, 20, 6, 250000, 'Mumtaz, istiqomah', 96, new Date()],
    ['MTB-002', 'KDR-002', '2026-08', 25, 88, 16, 4, 150000, 'Pertahankan tilawah yaumiyah', 88, new Date()],
    ['MTB-003', 'KDR-003', '2026-08', 18, 75, 10, 2, 100000, 'Tingkatkan shalat subuh berjamaah', 78, new Date()]
  ]);

  // 6. Sheet DB_USERS
  setupSheet(ss, SHEETS.USERS, [
    'ID', 'Username', 'Password', 'Role', 'Nama', 'Kecamatan', 'DibuatPada'
  ], [
    ['USR-001', 'admin', 'admin123', 'Super Admin', 'Admin DPD PKS Lebak', 'Rangkasbitung', new Date()],
    ['USR-002', 'ketua', 'ketua123', 'Ketua DPD', 'Lily Sugianto (Ketua DPD)', 'Rangkasbitung', new Date()],
    ['USR-003', 'bkap', 'bkap123', 'BKAP DPD', 'Ketua BKAP DPD Lebak', 'Rangkasbitung', new Date()],
    ['USR-004', 'pembimbing', 'murabbi123', 'Pembimbing', 'Murobbi', 'Rangkasbitung', new Date()],
    ['USR-005', 'kader', 'kader123', 'Kader', 'Kader', 'Warunggunung', new Date()]
  ]);

  // 7. Sheet DB_WILAYAH
  const wilayahRows = KECAMATAN_LEBAK.map((k, i) => [
    'WIL-' + String(i + 1).padStart(3, '0'),
    k.nama,
    k.dapil,
    k.targetKader
  ]);
  setupSheet(ss, SHEETS.WILAYAH, ['ID', 'Kecamatan', 'Dapil', 'TargetKader'], wilayahRows);

  // 8. Sheet DB_CONFIG (Logo & Parameter Aplikasi)
  setupSheet(ss, SHEETS.CONFIG, ['Key', 'Value', 'Keterangan'], [
    ['APP_NAME', APP_CONFIG.APP_NAME, 'Nama Aplikasi Resmi'],
    ['LOGO_URL', APP_CONFIG.LOGO_PRIMARY, 'Link Langsung Logo Google Drive'],
    ['LOGO_FALLBACK', APP_CONFIG.LOGO_FALLBACK, 'Thumbnail Fallback Logo Google Drive'],
    ['LOGO_DRIVE_ID', APP_CONFIG.LOGO_DRIVE_ID, 'Google Drive File ID'],
    ['VERSION', APP_CONFIG.VERSION, 'Versi Aplikasi']
  ]);

  // 9. Sheet DB_REKRUTMEN (Calon Anggota dari Luar - Khusus PJ Madya & Dewasa)
  setupSheet(ss, SHEETS.REKRUTMEN, [
    'ID', 'NamaCalon', 'NIK_KTP', 'JK', 'NoWA', 'Kecamatan', 'Desa', 'LatarBelakang', 'PJ_KaderID', 'PJ_Nama', 'PJ_Jenjang', 'Status', 'TanggalRekrut', 'Catatan', 'DibuatPada'
  ], [
    ['REK-001', 'Bambang Sudrajat, S.E.', '3602101505880001', 'Ikhwan', '081311223344', 'Rangkasbitung', 'Muara Ciujung Barat', 'Tokoh Masyarakat', 'KDR-001', 'Murobbi', 'Madya', 'Pendekatan Intensif', '2026-09-01', 'Berminat bergabung, rutin diajak kajian pekanan', new Date()],
    ['REK-002', 'Dewi Sartika, S.Pd', '3602102008920002', 'Akhwat', '085812345678', 'Rangkasbitung', 'Cijoro Pasir', 'Guru / Akademisi', 'KDR-004', 'Usth. Siti Khadijah, S.Ag', 'Madya', 'Siap DMP', '2026-09-03', 'Siap ikut Daurah Marhalah Pemula bulan ini', new Date()],
    ['REK-003', 'Hendri Kurniawan', '3602101012970003', 'Ikhwan', '087799887766', 'Warunggunung', 'Baros', 'Pemuda Karang Taruna', 'KDR-001', 'Murobbi', 'Madya', 'Prospek', '2026-09-05', 'Aktif di kegiatan bakti sosial kepemudaan', new Date()]
  ]);

  // 10. Sheet DB_MUTASI (Mutasi Masuk & Keluar)
  setupSheet(ss, SHEETS.MUTASI, [
    'ID', 'TipeMutasi', 'KaderID', 'NamaKader', 'Jenjang', 'JK', 'NoWA', 'AsalDaerah', 'TujuanDaerah', 'TanggalMutasi', 'NoSuratMutasi', 'StatusApproval', 'Alasan', 'DibuatPada'
  ], [
    ['MUT-001', 'Mutasi Masuk', '', 'Dr. H. Agus Suryana, M.Si', 'Dewasa', 'Ikhwan', '081288990011', 'DPD PKS Tangerang Selatan', 'Rangkasbitung (Dapil 1)', '2026-09-02', '012/SM-IN/BKAP-LBK/IX/2026', 'Disetujui', 'Pindah tugas dinas ke RSUD Adjidarmo Lebak', new Date()],
    ['MUT-002', 'Mutasi Keluar', 'KDR-003', 'Kader', 'Muda', 'Ikhwan', '085712345678', 'Warunggunung (Dapil 1)', 'DPD PKS Kota Serang', '2026-09-04', '015/SM-OUT/BKAP-LBK/IX/2026', 'Menunggu Verifikasi', 'Melanjutkan studi S2 di Untirta Serang', new Date()],
    ['MUT-003', 'Mutasi Masuk', '', 'Siti Maryam, S.Farm', 'Pratama', 'Akhwat', '081922334455', 'DPD PKS Kab. Bogor', 'Maja (Dapil 2)', '2026-09-05', '018/SM-IN/BKAP-LBK/IX/2026', 'Menunggu Verifikasi', 'Pindah domisili mengikuti suami di Citra Maja Raya', new Date()]
  ]);

  // 11. Sheet DB_LAPORAN_BKAP (Laporan Agenda & Evaluasi BKAP DPD)
  setupSheet(ss, SHEETS.LAPORAN_BKAP, [
    'ID', 'NamaAgenda', 'Tanggal', 'Lokasi', 'Kategori', 'TargetPeserta', 'RealisasiPeserta', 'PJ_Agenda', 'Status', 'EvaluasiKualitatif', 'DokumentasiUrl', 'DibuatPada'
  ], [
    ['RPT-001', 'Daurah Marhalah Pemula (DMP) Zona Lebak Selatan', '2026-08-25', 'Aula Hotel Rahayu Malingping', 'Daurah', 60, 56, 'Ust. Lukman Hakim (BKAP Lebak Selatan)', 'Selesai Dilaporkan', 'Peserta antusias, kehadiran mencapai 93.3%. Seluruh peserta siap ditempatkan ke 4 UPA baru.', '', new Date()],
    ['RPT-002', 'Pelatihan Murabbi & Upgrading UPA Se-Lebak', '2026-08-30', 'Aula DPD PKS Lebak', 'Pelatihan Murabbi', 40, 38, 'Bidang Kaderisasi BKAP DPD', 'Selesai Dilaporkan', 'Tingkat kehadiran 95%. Materi silabus dan metode mutabaah digital TAPAK LEBAK tersampaikan tuntas.', '', new Date()],
    ['RPT-003', 'Ta\'lim Bulanan Kader & Konsolidasi BKAP', '2026-09-06', 'Gedung PGRI Rangkasbitung', 'Ta\'lim Bulanan', 250, 235, 'Sekretaris BKAP DPD Lebak', 'Selesai Dilaporkan', 'Capaian 94%. Disosialisasikan target rekrutmen anggota eksternal per DPC.', '', new Date()]
  ]);

  invalidateInitialDataCache();
  return { status: 'success', message: 'Database TAPAK LEBAK berhasil diinisialisasi dengan data lengkap!' };
}

/**
 * Helper Membuat Sheet dan Header jika belum ada
 */
function setupSheet(ss, sheetName, headers, initialRows) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#FF6B00').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    
    if (initialRows && initialRows.length > 0) {
      sheet.getRange(2, 1, initialRows.length, initialRows[0].length).setValues(initialRows);
    }
  } else if (sheet.getLastRow() === 1 && initialRows && initialRows.length > 0) {
    // Jika sheet sudah ada header tapi datanya masih 0 baris
    sheet.getRange(2, 1, initialRows.length, initialRows[0].length).setValues(initialRows);
  }
  return sheet;
}

/**
 * Helper: Ambil Sheet berdasarkan nama dengan pencarian fleksibel (toleran huruf besar/kecil & variasi DB_)
 */
function getSheetByNameFlexible(ss, targetName) {
  if (!ss) return null;
  let sheet = ss.getSheetByName(targetName);
  if (sheet) return sheet;
  
  const cleanTarget = String(targetName).trim().toLowerCase();
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const sName = sheets[i].getName().trim().toLowerCase();
    if (sName === cleanTarget || 
        sName === cleanTarget.replace(/^db_/, '') || 
        ('db_' + sName) === cleanTarget ||
        sName.replace(/[\s_-]/g, '') === cleanTarget.replace(/[\s_-]/g, '')) {
      return sheets[i];
    }
  }
  return null;
}

/**
 * Helper: Bangun Map sheet sekali panggil agar pencarian lembar kerja instan (O(1))
 */
function buildSheetMap(ss) {
  const map = {};
  if (!ss) return map;
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i];
    const name = s.getName().trim().toLowerCase();
    map[name] = s;
    map[name.replace(/^db_/, '')] = s;
    map['db_' + name] = s;
    map[name.replace(/[\s_-]/g, '')] = s;
  }
  return map;
}

/**
 * Helper: Chunked Multi-Key Caching System (Google Apps Script CacheService)
 * Mengatasi batasan limit 100KB per key pada CacheService dengan memecah payload menjadi beberapa chunk
 */
function putChunkedScriptCache(prefix, jsonString, expirationSec) {
  try {
    const cache = CacheService.getScriptCache();
    if (!cache || !jsonString) return;
    const CHUNK_SIZE = 75000; // 75KB safe margin di bawah 100KB
    const totalChunks = Math.ceil(jsonString.length / CHUNK_SIZE);
    const cacheEntries = {};
    for (let i = 0; i < totalChunks; i++) {
      cacheEntries[prefix + '_chunk_' + i] = jsonString.substr(i * CHUNK_SIZE, CHUNK_SIZE);
    }
    cacheEntries[prefix + '_meta'] = JSON.stringify({
      count: totalChunks,
      len: jsonString.length,
      time: new Date().getTime()
    });
    cache.putAll(cacheEntries, expirationSec || 21600); // Default 6 jam
  } catch (e) {
    console.warn('putChunkedScriptCache warning:', e);
  }
}

function getChunkedScriptCache(prefix) {
  try {
    const cache = CacheService.getScriptCache();
    if (!cache) return null;
    const metaStr = cache.get(prefix + '_meta');
    if (!metaStr) return null;
    const meta = JSON.parse(metaStr);
    if (!meta || !meta.count) return null;
    const keys = [];
    for (let i = 0; i < meta.count; i++) {
      keys.push(prefix + '_chunk_' + i);
    }
    const chunksMap = cache.getAll(keys);
    let fullStr = '';
    for (let i = 0; i < meta.count; i++) {
      const chunk = chunksMap[prefix + '_chunk_' + i];
      if (!chunk) return null; // Jika ada 1 chunk hilang/kadaluarsa, anggap cache miss
      fullStr += chunk;
    }
    return JSON.parse(fullStr);
  } catch (e) {
    console.warn('getChunkedScriptCache warning:', e);
    return null;
  }
}

/**
 * Helper: Invalidate Script Cache saat data berubah (Save/Update/Delete)
 */
function invalidateInitialDataCache() {
  try {
    const cache = CacheService.getScriptCache();
    if (!cache) return;
    cache.remove('TAPAK LEBAK_INITIAL_DATA_V1');
    const metaStr = cache.get('TAPAK LEBAK_ALL_DATA_V2_meta');
    const keysToRemove = ['TAPAK LEBAK_ALL_DATA_V2_meta'];
    if (metaStr) {
      try {
        const meta = JSON.parse(metaStr);
        for (let i = 0; i < (meta.count || 15); i++) {
          keysToRemove.push('TAPAK LEBAK_ALL_DATA_V2_chunk_' + i);
        }
      } catch (err) {}
    }
    // Bersihkan juga chunk umum untuk safety
    for (let i = 0; i < 10; i++) {
      keysToRemove.push('TAPAK LEBAK_ALL_DATA_V2_chunk_' + i);
    }
    cache.removeAll(keysToRemove);
  } catch (e) {
    console.warn('Cache remove warning:', e);
  }
}

/**
 * API: Ambil semua data inisial aplikasi (Kader, UPA, Agenda, Presensi, Mutaba'ah, Wilayah)
 * Dioptimalkan dengan Multi-Chunk CacheService untuk respon instan (<150ms dari RAM server)
 */
function apiGetInitialData(forceRefresh) {
  try {
    // 1. Cek Multi-Chunk CacheService hanya jika BUKAN forceRefresh
    if (!forceRefresh) {
      try {
        const cachedData = getChunkedScriptCache('TAPAK LEBAK_ALL_DATA_V2');
        if (cachedData && Array.isArray(cachedData.kaderList) && cachedData.kaderList.length > 0) {
          return {
            status: 'success',
            data: cachedData,
            cached: true
          };
        }
        // Cek legacy fallback cache
        const cache = CacheService.getScriptCache();
        if (cache) {
          const cachedStr = cache.get('TAPAK LEBAK_INITIAL_DATA_V1');
          if (cachedStr) {
            const cachedObj = JSON.parse(cachedStr);
            if (cachedObj && Array.isArray(cachedObj.kaderList) && cachedObj.kaderList.length > 0) {
              return {
                status: 'success',
                data: cachedObj,
                cached: true
              };
            }
          }
        }
      } catch (cacheErr) {
        console.warn('Cache read warning:', cacheErr);
      }
    } else {
      try {
        if (typeof invalidateInitialDataCache === 'function') {
          invalidateInitialDataCache();
        }
      } catch (e) {}
    }

    const ss = getSpreadsheet();
    if (!ss) {
      return {
        status: 'error',
        message: 'Spreadsheet aktif tidak ditemukan. Pastikan script terhubung dengan Google Sheets.',
        fallbackData: getFallbackMockData()
      };
    }
    
    // Bangun sheetMap sekali panggil untuk seluruh pembacaan
    let sheetMap = buildSheetMap(ss);

    // AUTO-SEED GUARD: Jika sheet DB_KADER atau DB_UPA belum ada atau belum punya data (<= 1 baris), inisialisasi sheet otomatis
    let sheetKader = sheetMap['db_kader'] || sheetMap['kader'] || getSheetByNameFlexible(ss, SHEETS.KADER);
    let sheetUPA = sheetMap['db_upa'] || sheetMap['upa'] || getSheetByNameFlexible(ss, SHEETS.UPA);
    if (!sheetKader || sheetKader.getLastRow() <= 1 || !sheetUPA || sheetUPA.getLastRow() <= 1) {
      try {
        initDatabase();
        sheetMap = buildSheetMap(ss);
      } catch (initErr) {
        console.warn('Auto-init database warning:', initErr);
      }
    }

    // Ambil konfigurasi dinamis dari DB_CONFIG / Config jika sudah pernah diubah admin
    const configData = { ...APP_CONFIG };
    const sheetConfig = sheetMap['db_config'] || sheetMap['config'] || getSheetByNameFlexible(ss, SHEETS.CONFIG);
    
    if (sheetConfig && sheetConfig.getLastRow() >= 2) {
      const configRows = readSheetData(ss, sheetConfig.getName(), sheetMap);
      let logoFound = false;

      if (configRows && configRows.length > 0) {
        configRows.forEach(c => {
          const keyUpper = String(c.Key || '').trim().toUpperCase();
          if ((keyUpper === 'LOGO_URL' || keyUpper === 'LOGO' || keyUpper === 'LOGO_PRIMARY') && c.Value) {
            const normalized = normalizeDriveImageUrl(String(c.Value));
            configData.LOGO_PRIMARY = normalized.directUrl;
            configData.LOGO_FALLBACK = normalized.fallbackUrl;
            configData.LOGO_DRIVE_ID = normalized.driveId || configData.LOGO_DRIVE_ID;
            logoFound = true;
          }
          if (keyUpper === 'BANNER_HERO_URL' && c.Value) {
            const normalizedBanner = normalizeDriveImageUrl(String(c.Value));
            configData.BANNER_HERO_URL = normalizedBanner.directUrl;
          }
          if (keyUpper === 'APP_NAME' && c.Value) {
            configData.APP_NAME = c.Value;
          }
        });
      }

      // Prioritas: Jika user menulis langsung di Sheet baris ke-2 kolom B
      if (!logoFound && sheetConfig.getLastRow() >= 2) {
        const valRow2ColB = sheetConfig.getRange(2, 2).getValue();
        if (valRow2ColB) {
          const normalized = normalizeDriveImageUrl(String(valRow2ColB));
          configData.LOGO_PRIMARY = normalized.directUrl;
          configData.LOGO_FALLBACK = normalized.fallbackUrl;
          configData.LOGO_DRIVE_ID = normalized.driveId || configData.LOGO_DRIVE_ID;
        }
      }
    }

    let kaderData = readSheetData(ss, SHEETS.KADER, sheetMap);
    let upaData = readSheetData(ss, SHEETS.UPA, sheetMap);
    let agendaData = readSheetData(ss, SHEETS.AGENDA, sheetMap);
    let presensiData = readSheetData(ss, SHEETS.PRESENSI, sheetMap);
    let mutabaahData = readSheetData(ss, SHEETS.MUTABAAH, sheetMap);
    let rekrutmenData = readSheetData(ss, SHEETS.REKRUTMEN, sheetMap);
    let mutasiData = readSheetData(ss, SHEETS.MUTASI, sheetMap);
    let laporanBkapData = readSheetData(ss, SHEETS.LAPORAN_BKAP, sheetMap);
    const wilayahRaw = readSheetData(ss, SHEETS.WILAYAH, sheetMap);

    // Fallback safety: jika sheet baru belum terisi data, ambil dari master mock data agar tidak pernah kosong
    const fallback = getFallbackMockData();
    if (!kaderData || kaderData.length === 0) kaderData = fallback.kaderList || [];
    if (!upaData || upaData.length === 0) upaData = fallback.upaList || [];
    if (!agendaData || agendaData.length === 0) agendaData = fallback.agendaList || [];
    if (!presensiData || presensiData.length === 0) presensiData = fallback.presensiList || [];
    if (!mutabaahData || mutabaahData.length === 0) mutabaahData = fallback.mutabaahList || [];
    if (!rekrutmenData || rekrutmenData.length === 0) rekrutmenData = fallback.rekrutmenList || [];
    if (!mutasiData || mutasiData.length === 0) mutasiData = fallback.mutasiList || [];
    if (!laporanBkapData || laporanBkapData.length === 0) laporanBkapData = fallback.laporanBkapList || [];

    let wilayahData = [];
    if (wilayahRaw && wilayahRaw.length > 0) {
      wilayahData = wilayahRaw.map((w, idx) => {
        const kecName = String(w.Kecamatan || w.nama || '').trim();
        const dapilName = String(w.Dapil || w.dapil || '').trim();
        const targetNum = Number(w.TargetKader || w.targetKader || 150);
        return {
          ID: w.ID || ('WIL-' + String(idx + 1).padStart(3, '0')),
          nama: kecName,
          Kecamatan: kecName,
          dapil: dapilName,
          Dapil: dapilName,
          targetKader: targetNum,
          TargetKader: targetNum
        };
      }).filter(w => w.nama !== '');
    }
    if (wilayahData.length === 0) {
      wilayahData = KECAMATAN_LEBAK.map((k, i) => ({
        ID: 'WIL-' + String(i + 1).padStart(3, '0'),
        nama: k.nama,
        Kecamatan: k.nama,
        dapil: k.dapil,
        Dapil: k.dapil,
        targetKader: k.targetKader,
        TargetKader: k.targetKader
      }));
    }

    const payload = {
      config: configData,
      kaderList: kaderData,
      upaList: upaData,
      agendaList: agendaData,
      presensiList: presensiData,
      mutabaahList: mutabaahData,
      wilayahList: wilayahData,
      rekrutmenList: rekrutmenData,
      mutasiList: mutasiData,
      laporanBkapList: laporanBkapData,
      jenjangList: JENJANG_KADER,
      timestamp: new Date().toISOString()
    };

    // Simpan ke CacheService secara Multi-Chunk (mampu menampung payload besar tanpa limit 100KB)
    if (kaderData && kaderData.length > 0) {
      try {
        const serialized = JSON.stringify(payload);
        putChunkedScriptCache('TAPAK LEBAK_ALL_DATA_V2', serialized, 21600); // 6 jam di RAM server
        // Simpan juga ke cache legacy jika muat untuk kompatibilitas mundur
        if (serialized.length < 95000) {
          const legacyCache = CacheService.getScriptCache();
          if (legacyCache) legacyCache.put('TAPAK LEBAK_INITIAL_DATA_V1', serialized, 21600);
        }
      } catch (saveCacheErr) {
        console.warn('Cache save warning:', saveCacheErr);
      }
    }

    return {
      status: 'success',
      data: payload
    };
  } catch (err) {
    return {
      status: 'error',
      message: err.toString(),
      fallbackData: getFallbackMockData()
    };
  }
}

/**
 * Helper membaca sheet menjadi array of object dengan sanitasi tipe data string
 * Mendukung pencarian instan via sheetMap dan normalisasi atribut ganda
 */
function readSheetData(ss, sheetName, sheetMap) {
  if (!ss) return [];
  let sheet = null;
  if (sheetMap) {
    const clean = String(sheetName).trim().toLowerCase();
    sheet = sheetMap[clean] || sheetMap[clean.replace(/^db_/, '')] || sheetMap['db_' + clean] || sheetMap[clean.replace(/[\s_-]/g, '')];
  }
  if (!sheet) {
    sheet = getSheetByNameFlexible(ss, sheetName);
  }
  if (!sheet || sheet.getLastRow() <= 1) return [];
  
  const values = sheet.getDataRange().getValues();
  if (!values || values.length <= 1) return [];
  
  const headers = values[0].map(h => String(h || '').trim());
  const results = [];
  
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const obj = {};
    let hasData = false;
    for (let j = 0; j < headers.length; j++) {
      const headerKey = headers[j];
      if (!headerKey) continue;
      
      let val = row[j];
      if (val instanceof Date) {
        try {
          val = Utilities.formatDate(val, 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
        } catch (e) {
          val = String(val);
        }
      } else if (val === null || val === undefined) {
        val = '';
      } else {
        val = String(val).trim();
      }
      if (val !== '') hasData = true;
      obj[headerKey] = val;
      // Tambahkan varian kunci normalisasi (lowercase tanpa spasi/garis bawah) agar aman dari typo/huruf besar-kecil
      const cleanKey = headerKey.toLowerCase().replace(/[\s_-]/g, '');
      if (obj[cleanKey] === undefined) {
        obj[cleanKey] = val;
      }
    }
    if (hasData) {
      results.push(obj);
    }
  }
  return results;
}

/**
 * Helper Global: Pemetaan data objek ke array baris tabel Google Sheets yang toleran variasi header
 */
function mapDataToRow(headers, dataObj) {
  return headers.map(h => {
    const rawH = String(h || '').trim();
    if (dataObj[rawH] !== undefined && dataObj[rawH] !== null) return String(dataObj[rawH]);
    const cleanH = rawH.toLowerCase().replace(/[\s_-]/g, '');
    for (const k in dataObj) {
      if (String(k).toLowerCase().replace(/[\s_-]/g, '') === cleanH) {
        return (dataObj[k] !== undefined && dataObj[k] !== null) ? String(dataObj[k]) : '';
      }
    }
    return '';
  });
}

/**
 * Helper Global: Mencari nomor baris (1-based) berdasarkan kolom ID secara case-insensitive
 */
function findRowIndexById(values, headers, targetId) {
  let idCol = headers.findIndex(h => String(h || '').trim().toLowerCase() === 'id');
  if (idCol < 0) idCol = 0;
  const cleanTarget = String(targetId || '').trim().toLowerCase();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol] || '').trim().toLowerCase() === cleanTarget) {
      return i + 1; // 1-based row index untuk sheet
    }
  }
  return -1;
}

/**
 * API: Simpan / Update Kader
 */
function apiSaveKader(kaderData) {
  try {
    const ss = getSpreadsheet();
    let sheet = getSheetByNameFlexible(ss, SHEETS.KADER);
    if (!sheet) {
      initDatabase();
      sheet = getSheetByNameFlexible(ss, SHEETS.KADER);
    }
    if (!sheet) return { status: 'error', message: 'Sheet Kader tidak ditemukan' };
    
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(h => String(h || '').trim());
    
    const id = kaderData.ID || ('KDR-' + String(Date.now()).slice(-6));
    kaderData.ID = id;
    if (!kaderData.DibuatPada) {
      kaderData.DibuatPada = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
    }
    
    // Cek apakah update atau baru menggunakan pencocokan ID yang fleksibel
    const existingRowIndex = findRowIndexById(values, headers, id);
    const rowValues = mapDataToRow(headers, kaderData);
    
    if (existingRowIndex > 0) {
      sheet.getRange(existingRowIndex, 1, 1, headers.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }
    
    invalidateInitialDataCache();
    return { status: 'success', message: 'Data Kader ' + (kaderData.Nama || id) + ' berhasil disimpan!', data: kaderData };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * API: Hapus Kader
 */
function apiDeleteKader(id) {
  try {
    const ss = getSpreadsheet();
    const sheet = getSheetByNameFlexible(ss, SHEETS.KADER);
    if (!sheet) return { status: 'error', message: 'Sheet Kader tidak ditemukan' };
    
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(h => String(h || '').trim());
    const existingRowIndex = findRowIndexById(values, headers, id);
    
    if (existingRowIndex > 0) {
      sheet.deleteRow(existingRowIndex);
      invalidateInitialDataCache();
      return { status: 'success', message: 'Kader ' + id + ' berhasil dihapus.' };
    }
    return { status: 'error', message: 'ID Kader ' + id + ' tidak ditemukan di sheet.' };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * API: Simpan / Update UPA
 */
function apiSaveUPA(upaData) {
  try {
    const ss = getSpreadsheet();
    let sheet = getSheetByNameFlexible(ss, SHEETS.UPA);
    if (!sheet) {
      initDatabase();
      sheet = getSheetByNameFlexible(ss, SHEETS.UPA);
    }
    if (!sheet) return { status: 'error', message: 'Sheet UPA tidak ditemukan' };
    
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(h => String(h || '').trim());
    
    const id = upaData.ID || ('UPA-' + String(Date.now()).slice(-4));
    upaData.ID = id;
    if (!upaData.DibuatPada) {
      upaData.DibuatPada = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
    }
    
    const existingRowIndex = findRowIndexById(values, headers, id);
    const rowValues = mapDataToRow(headers, upaData);
    
    if (existingRowIndex > 0) {
      sheet.getRange(existingRowIndex, 1, 1, headers.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }
    
    invalidateInitialDataCache();
    return { status: 'success', message: 'Data UPA ' + (upaData.NamaUPA || '') + ' berhasil disimpan!', data: upaData };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * API: Hapus UPA
 */
function apiDeleteUPA(id) {
  try {
    const ss = getSpreadsheet();
    const sheet = getSheetByNameFlexible(ss, SHEETS.UPA);
    if (!sheet) return { status: 'error', message: 'Sheet UPA tidak ditemukan' };
    
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(h => String(h || '').trim());
    const existingRowIndex = findRowIndexById(values, headers, id);
    
    if (existingRowIndex > 0) {
      sheet.deleteRow(existingRowIndex);
      invalidateInitialDataCache();
      return { status: 'success', message: 'Kelompok UPA ' + id + ' berhasil dihapus.' };
    }
    return { status: 'error', message: 'ID UPA ' + id + ' tidak ditemukan di database' };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * API: Simpan Agenda
 */
function apiSaveAgenda(agendaData) {
  try {
    const ss = getSpreadsheet();
    let sheet = getSheetByNameFlexible(ss, SHEETS.AGENDA);
    if (!sheet) {
      initDatabase();
      sheet = getSheetByNameFlexible(ss, SHEETS.AGENDA);
    }
    if (!sheet) return { status: 'error', message: 'Sheet Agenda tidak ditemukan' };
    
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(h => String(h || '').trim());
    
    const id = agendaData.ID || ('AGD-' + String(Date.now()).slice(-4));
    agendaData.ID = id;
    if (!agendaData.DibuatPada) {
      agendaData.DibuatPada = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
    }
    
    const existingRowIndex = findRowIndexById(values, headers, id);
    const rowValues = mapDataToRow(headers, agendaData);
    
    if (existingRowIndex > 0) {
      sheet.getRange(existingRowIndex, 1, 1, headers.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }
    
    invalidateInitialDataCache();
    return { status: 'success', message: 'Agenda "' + (agendaData.NamaAgenda || id) + '" berhasil disimpan!', data: agendaData };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * API: Hapus Agenda
 */
function apiDeleteAgenda(id) {
  try {
    const ss = getSpreadsheet();
    const sheet = getSheetByNameFlexible(ss, SHEETS.AGENDA);
    if (!sheet) return { status: 'error', message: 'Sheet Agenda tidak ditemukan' };
    
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(h => String(h || '').trim());
    const existingRowIndex = findRowIndexById(values, headers, id);
    
    if (existingRowIndex > 0) {
      sheet.deleteRow(existingRowIndex);
      invalidateInitialDataCache();
      return { status: 'success', message: 'Agenda ' + id + ' berhasil dihapus.' };
    }
    return { status: 'error', message: 'ID Agenda ' + id + ' tidak ditemukan di database' };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * API: Submit Presensi untuk sebuah Agenda dengan Dukungan GPS Geolocation & Geofencing
 * @param {string} agendaId
 * @param {Array} attendanceRecords [{ kaderId, status, keterangan, latitude, longitude, akurasi, statusGeofence, alamatLokasi }]
 * @param {Object} [gpsData] Opsional data GPS umum jika record tidak memiliki data individual
 */
function apiSubmitPresensi(agendaId, attendanceRecords, gpsData) {
  try {
    const ss = getSpreadsheet();
    let sheet = getSheetByNameFlexible(ss, SHEETS.PRESENSI);
    if (!sheet) {
      initDatabase();
      sheet = getSheetByNameFlexible(ss, SHEETS.PRESENSI);
    }
    if (!sheet) return { status: 'error', message: 'Sheet Presensi tidak ditemukan' };
    
    // Pastikan header sheet DB_PRESENSI memiliki kolom GPS
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
    const expectedHeaders = ['ID', 'AgendaID', 'KaderID', 'Tanggal', 'Status', 'Keterangan', 'DibuatPada', 'Latitude', 'Longitude', 'Akurasi', 'StatusGeofence', 'AlamatLokasi'];
    if (headers.length < expectedHeaders.length) {
      for (let c = headers.length; c < expectedHeaders.length; c++) {
        sheet.getRange(1, c + 1).setValue(expectedHeaders[c]);
      }
    }
    
    const today = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
    const nowTimestamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
    
    const values = sheet.getDataRange().getValues();
    // Petakan data presensi yang ada: key = agendaId + '_' + kaderId => rowIndex (1-based)
    const existingMap = {};
    for (let i = 1; i < values.length; i++) {
      const rowAgendaId = String(values[i][1] || '').trim();
      const rowKaderId = String(values[i][2] || '').trim();
      if (rowAgendaId && rowKaderId) {
        existingMap[rowAgendaId + '_' + rowKaderId] = i + 1;
      }
    }
    
    const newRows = [];
    let updateCount = 0;
    const cleanAgendaId = String(agendaId || '').trim();
    
    attendanceRecords.forEach(rec => {
      const cleanKaderId = String(rec.kaderId || '').trim();
      if (!cleanKaderId) return;
      
      const key = cleanAgendaId + '_' + cleanKaderId;
      const existingRow = existingMap[key];
      const statusVal = String(rec.status || 'Hadir').trim();
      const ketVal = String(rec.keterangan || '').trim();
      
      const latVal = rec.latitude || (gpsData && gpsData.lat) || '';
      const lngVal = rec.longitude || (gpsData && gpsData.lng) || '';
      const accVal = rec.akurasi || (gpsData && gpsData.accuracy) || '';
      const geoVal = rec.statusGeofence || (gpsData && (gpsData.isInside ? 'Di Lokasi' : 'Luar Radius')) || '';
      const locVal = rec.alamatLokasi || (gpsData && gpsData.locationName) || '';
      
      if (existingRow) {
        // Update kolom Status (5), Keterangan (6), DibuatPada (7), Latitude (8), Longitude (9), Akurasi (10), StatusGeofence (11), AlamatLokasi (12)
        sheet.getRange(existingRow, 5, 1, 8).setValues([[statusVal, ketVal, nowTimestamp, latVal, lngVal, accVal, geoVal, locVal]]);
        updateCount++;
      } else {
        // Tambah baris baru
        newRows.push([
          'PRS-' + String(Date.now()).slice(-6) + '-' + Math.floor(Math.random() * 1000),
          cleanAgendaId,
          cleanKaderId,
          today,
          statusVal,
          ketVal,
          nowTimestamp,
          latVal,
          lngVal,
          accVal,
          geoVal,
          locVal
        ]);
      }
    });
    
    if (newRows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
    }
    
    const totalProcessed = updateCount + newRows.length;
    invalidateInitialDataCache();
    return { 
      status: 'success', 
      message: 'Presensi & koordinat GPS tersimpan! (' + newRows.length + ' baru, ' + updateCount + ' diperbarui)',
      total: totalProcessed
    };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * API: Simpan / Update Target Wilayah Kecamatan (DB_WILAYAH)
 */
function apiSaveWilayah(wilayahData) {
  try {
    const ss = getSpreadsheet();
    let sheet = getSheetByNameFlexible(ss, SHEETS.WILAYAH);
    if (!sheet) {
      initDatabase();
      sheet = getSheetByNameFlexible(ss, SHEETS.WILAYAH);
    }
    if (!sheet) return { status: 'error', message: 'Sheet Wilayah tidak ditemukan' };

    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(h => String(h || '').trim());

    const id = wilayahData.ID || ('WIL-' + String(Date.now()).slice(-3));
    wilayahData.ID = id;

    const payload = {
      ID: id,
      Kecamatan: wilayahData.nama || wilayahData.Kecamatan || '',
      Dapil: wilayahData.dapil || wilayahData.Dapil || 'Dapil 1',
      TargetKader: Number(wilayahData.targetKader || wilayahData.TargetKader || 100)
    };

    let existingRowIndex = -1;
    for (let i = 1; i < values.length; i++) {
      const rowId = String(values[i][0]).trim();
      const rowKec = String(values[i][1]).trim();
      if ((rowId && rowId === String(id).trim()) || (rowKec && rowKec.toLowerCase() === payload.Kecamatan.toLowerCase())) {
        existingRowIndex = i + 1;
        break;
      }
    }

    const rowValues = headers.map(h => payload[h] !== undefined ? String(payload[h]) : '');

    if (existingRowIndex > 0) {
      sheet.getRange(existingRowIndex, 1, 1, headers.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }

    invalidateInitialDataCache();
    return { 
      status: 'success', 
      message: 'Wilayah ' + payload.Kecamatan + ' berhasil disimpan!', 
      data: {
        ID: id,
        nama: payload.Kecamatan,
        dapil: payload.Dapil,
        targetKader: payload.TargetKader
      }
    };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * API: Hapus Wilayah Kecamatan (DB_WILAYAH)
 */
function apiDeleteWilayah(id) {
  try {
    const ss = getSpreadsheet();
    const sheet = getSheetByNameFlexible(ss, SHEETS.WILAYAH);
    if (!sheet) return { status: 'error', message: 'Sheet Wilayah tidak ditemukan' };

    const values = sheet.getDataRange().getValues();
    const targetId = String(id).trim();
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]).trim() === targetId || String(values[i][1]).trim() === targetId) {
        sheet.deleteRow(i + 1);
        invalidateInitialDataCache();
        return { status: 'success', message: 'Wilayah ' + id + ' berhasil dihapus dari database.' };
      }
    }
    return { status: 'error', message: 'ID Wilayah tidak ditemukan di database' };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * ==========================================================================
 * 1. API REKRUTMEN ANGGOTA DARI LUAR (KHUSUS PJ MADYA & DEWASA)
 * ==========================================================================
 */

/**
 * API: Simpan / Edit Data Calon Kader Rekrutmen
 * Validasi penugasan kader: fleksibel terhadap huruf besar/kecil
 */
function apiSaveRekrutmen(payload) {
  try {
    const ss = getSpreadsheet();
    let sheet = getSheetByNameFlexible(ss, SHEETS.REKRUTMEN);
    if (!sheet) {
      initDatabase();
      sheet = getSheetByNameFlexible(ss, SHEETS.REKRUTMEN);
    }
    if (!sheet) return { status: 'error', message: 'Sheet DB_REKRUTMEN tidak ditemukan' };

    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(h => String(h || '').trim());
    const id = payload.ID || ('REK-' + String(Date.now()).slice(-6));
    payload.ID = id;
    if (!payload.DibuatPada) {
      payload.DibuatPada = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
    }

    const existingRowIndex = findRowIndexById(values, headers, id);
    const rowValues = mapDataToRow(headers, payload);

    if (existingRowIndex > 0) {
      sheet.getRange(existingRowIndex, 1, 1, headers.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }

    invalidateInitialDataCache();
    return {
      status: 'success',
      message: 'Data calon rekrutmen ' + (payload.NamaCalon || id) + ' berhasil disimpan!',
      data: payload
    };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * API: Hapus Data Rekrutmen
 */
function apiDeleteRekrutmen(id) {
  try {
    const ss = getSpreadsheet();
    const sheet = getSheetByNameFlexible(ss, SHEETS.REKRUTMEN);
    if (!sheet) return { status: 'error', message: 'Sheet Rekrutmen tidak ditemukan' };

    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(h => String(h || '').trim());
    const existingRowIndex = findRowIndexById(values, headers, id);

    if (existingRowIndex > 0) {
      sheet.deleteRow(existingRowIndex);
      invalidateInitialDataCache();
      return { status: 'success', message: 'Data rekrutmen berhasil dihapus.' };
    }
    return { status: 'error', message: 'ID Rekrutmen tidak ditemukan di database' };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * ==========================================================================
 * 2. API MANAJEMEN MUTASI KADER (MASUK & KELUAR)
 * ==========================================================================
 */

/**
 * API: Simpan / Ajukan Mutasi Kader
 */
function apiSaveMutasi(payload) {
  try {
    const ss = getSpreadsheet();
    let sheet = getSheetByNameFlexible(ss, SHEETS.MUTASI);
    if (!sheet) {
      initDatabase();
      sheet = getSheetByNameFlexible(ss, SHEETS.MUTASI);
    }
    if (!sheet) return { status: 'error', message: 'Sheet DB_MUTASI tidak ditemukan' };

    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(h => String(h || '').trim());
    const id = payload.ID || ('MUT-' + String(Date.now()).slice(-6));
    payload.ID = id;
    if (!payload.StatusApproval) payload.StatusApproval = 'Menunggu Verifikasi';
    if (!payload.DibuatPada) {
      payload.DibuatPada = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
    }

    const existingRowIndex = findRowIndexById(values, headers, id);
    const rowValues = mapDataToRow(headers, payload);

    if (existingRowIndex > 0) {
      sheet.getRange(existingRowIndex, 1, 1, headers.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }

    invalidateInitialDataCache();
    return {
      status: 'success',
      message: 'Permohonan mutasi kader ' + (payload.NamaKader || id) + ' berhasil disimpan!',
      data: payload
    };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * API: Verifikasi / Approve Mutasi Kader
 */
function apiApproveMutasi(id, statusApproval) {
  try {
    const ss = getSpreadsheet();
    const sheet = getSheetByNameFlexible(ss, SHEETS.MUTASI);
    if (!sheet) return { status: 'error', message: 'Sheet Mutasi tidak ditemukan' };

    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(h => String(h || '').trim());
    const statusColIdx = headers.findIndex(h => h.toLowerCase().replace(/[\s_-]/g, '') === 'statusapproval');
    if (statusColIdx === -1) return { status: 'error', message: 'Kolom StatusApproval tidak ditemukan' };

    const existingRowIndex = findRowIndexById(values, headers, id);
    if (existingRowIndex > 0) {
      sheet.getRange(existingRowIndex, statusColIdx + 1).setValue(statusApproval || 'Disetujui');
      invalidateInitialDataCache();
      return { 
        status: 'success', 
        message: 'Status mutasi ' + id + ' berhasil diubah menjadi: ' + (statusApproval || 'Disetujui') 
      };
    }
    return { status: 'error', message: 'ID Mutasi tidak ditemukan di database' };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * API: Hapus Data Mutasi
 */
function apiDeleteMutasi(id) {
  try {
    const ss = getSpreadsheet();
    const sheet = getSheetByNameFlexible(ss, SHEETS.MUTASI);
    if (!sheet) return { status: 'error', message: 'Sheet Mutasi tidak ditemukan' };

    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(h => String(h || '').trim());
    const existingRowIndex = findRowIndexById(values, headers, id);

    if (existingRowIndex > 0) {
      sheet.deleteRow(existingRowIndex);
      invalidateInitialDataCache();
      return { status: 'success', message: 'Data mutasi berhasil dihapus.' };
    }
    return { status: 'error', message: 'ID Mutasi tidak ditemukan di database' };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * ==========================================================================
 * 3. API LAPORAN AGENDA BKAP DPD
 * ==========================================================================
 */

/**
 * API: Simpan / Edit Laporan Agenda BKAP
 */
function apiSaveLaporanBKAP(payload) {
  try {
    const ss = getSpreadsheet();
    let sheet = getSheetByNameFlexible(ss, SHEETS.LAPORAN_BKAP);
    if (!sheet) {
      initDatabase();
      sheet = getSheetByNameFlexible(ss, SHEETS.LAPORAN_BKAP);
    }
    if (!sheet) return { status: 'error', message: 'Sheet DB_LAPORAN_BKAP tidak ditemukan' };

    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(h => String(h || '').trim());
    const id = payload.ID || ('RPT-' + String(Date.now()).slice(-6));
    payload.ID = id;
    if (!payload.Status) payload.Status = 'Selesai Dilaporkan';
    if (!payload.DibuatPada) {
      payload.DibuatPada = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
    }

    const existingRowIndex = findRowIndexById(values, headers, id);
    const rowValues = mapDataToRow(headers, payload);

    if (existingRowIndex > 0) {
      sheet.getRange(existingRowIndex, 1, 1, headers.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }

    invalidateInitialDataCache();
    return {
      status: 'success',
      message: 'Laporan agenda BKAP ' + (payload.NamaAgenda || id) + ' berhasil disimpan!',
      data: payload
    };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * API: Hapus Laporan Agenda BKAP
 */
function apiDeleteLaporanBKAP(id) {
  try {
    const ss = getSpreadsheet();
    const sheet = getSheetByNameFlexible(ss, SHEETS.LAPORAN_BKAP);
    if (!sheet) return { status: 'error', message: 'Sheet Laporan BKAP tidak ditemukan' };

    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(h => String(h || '').trim());
    const existingRowIndex = findRowIndexById(values, headers, id);

    if (existingRowIndex > 0) {
      sheet.deleteRow(existingRowIndex);
      invalidateInitialDataCache();
      return { status: 'success', message: 'Laporan agenda BKAP berhasil dihapus.' };
    }
    return { status: 'error', message: 'ID Laporan BKAP tidak ditemukan di database' };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * API: Simpan Mutaba'ah Kader
 */
function apiSaveMutabaah(mtbData) {
  try {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName(SHEETS.MUTABAAH);
    if (!sheet) initDatabase();
    sheet = ss.getSheetByName(SHEETS.MUTABAAH);
    
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    
    const id = mtbData.ID || ('MTB-' + String(Date.now()).slice(-5));
    mtbData.ID = id;
    mtbData.DibuatPada = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
    
    // Hitung Skor Sederhana (0 - 100)
    const tilawah = Math.min(Number(mtbData.TilawahJuz || 0) / 30 * 35, 35);
    const shalat = Math.min(Number(mtbData.SholatJamaahPersen || 0) * 0.35, 35);
    const qiyam = Math.min(Number(mtbData.QiyamulLailHari || 0) / 20 * 15, 15);
    const shaum = Math.min(Number(mtbData.ShaumSunnahHari || 0) / 6 * 15, 15);
    mtbData.SkorTotal = Math.round(tilawah + shalat + qiyam + shaum);
    
    const rowValues = headers.map(h => mtbData[h] !== undefined ? mtbData[h] : '');
    sheet.appendRow(rowValues);
    
    invalidateInitialDataCache();
    return { status: 'success', message: 'Mutaba\'ah kader berhasil disimpan!', skor: mtbData.SkorTotal };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * Data Cadangan / Mock jika dijalankan di luar konteks spreadsheet terhubung
 */
function getFallbackMockData() {
  return {
    kaderList: [
      { ID: 'KDR-001', NIK_KTA: '3602101001920001', Nama: 'Murobbi', JK: 'Ikhwan', NoWA: '081234567890', Kecamatan: 'Rangkasbitung', Desa: 'Muara Ciujung Timur', UPA_ID: 'UPA-001', Jenjang: 'Madya', Status: 'Aktif' },
      { ID: 'KDR-002', NIK_KTA: '3602102505950002', Nama: 'H. Muhammad Rizqi, M.T.', JK: 'Ikhwan', NoWA: '081298765432', Kecamatan: 'Cibadak', Desa: 'Asem', UPA_ID: 'UPA-001', Jenjang: 'Pratama', Status: 'Aktif' },
      { ID: 'KDR-003', NIK_KTA: '3602101211980003', Nama: 'Kader', JK: 'Ikhwan', NoWA: '085712345678', Kecamatan: 'Warunggunung', Desa: 'Selaraja', UPA_ID: 'UPA-001', Jenjang: 'Muda', Status: 'Aktif' },
      { ID: 'KDR-004', NIK_KTA: '3602101908900004', Nama: 'Usth. Siti Khadijah, S.Ag', JK: 'Akhwat', NoWA: '087812345678', Kecamatan: 'Rangkasbitung', Desa: 'Cijoro Lebak', UPA_ID: 'UPA-002', Jenjang: 'Madya', Status: 'Aktif' },
      { ID: 'KDR-005', NIK_KTA: '3602100407990005', Nama: 'Nurul Aini, S.Si', JK: 'Akhwat', NoWA: '081398765432', Kecamatan: 'Kalanganyar', Desa: 'Sukamekarsari', UPA_ID: 'UPA-002', Jenjang: 'Muda', Status: 'Aktif' },
      { ID: 'KDR-006', NIK_KTA: '3602101503930006', Nama: 'Dedi Supriyadi', JK: 'Ikhwan', NoWA: '085211223344', Kecamatan: 'Malingping', Desa: 'Malingping Utara', UPA_ID: 'UPA-003', Jenjang: 'Pratama', Status: 'Aktif' },
      { ID: 'KDR-007', NIK_KTA: '3602102209970007', Nama: 'Irfan Hakim, S.T.', JK: 'Ikhwan', NoWA: '081900998877', Kecamatan: 'Bayah', Desa: 'Bayah Barat', UPA_ID: 'UPA-003', Jenjang: 'Muda', Status: 'Aktif' }
    ],
    upaList: [
      { ID: 'UPA-001', NamaUPA: 'UPA Al-Fatih 1', Pembimbing: 'Murobbi', Jenjang: 'Muda - Pratama', Jadwal: 'Ahad, 06.00 WIB', Kecamatan: 'Rangkasbitung', Kategori: 'Ikhwan' },
      { ID: 'UPA-002', NamaUPA: 'UPA Khadijah 1', Pembimbing: 'Usth. Siti Khadijah, S.Ag', Jenjang: 'Muda - Pratama', Jadwal: 'Sabtu, 16.00 WIB', Kecamatan: 'Rangkasbitung', Kategori: 'Akhwat' },
      { ID: 'UPA-003', NamaUPA: 'UPA Shalahuddin 1', Pembimbing: 'Ust. Lukman Hakim', Jenjang: 'Pemula - Muda', Jadwal: 'Ahad, 08.00 WIB', Kecamatan: 'Malingping', Kategori: 'Ikhwan' }
    ],
    agendaList: [
      { ID: 'AGD-001', NamaAgenda: 'Liqo Rutin Pekanan UPA Al-Fatih', Kategori: 'Liqo UPA', Tanggal: '2026-09-13', Waktu: '06:00 - 08:00', Lokasi: 'Masjid Agung Al-A\'raf', Tingkat: 'UPA', Status: 'Mendatang' },
      { ID: 'AGD-002', NamaAgenda: 'Daurah Marhalah Pemula (DMP) Lebak', Kategori: 'Daurah', Tanggal: '2026-09-20', Waktu: '08:00 - 15:30', Lokasi: 'Aula DPD PKS Lebak', Tingkat: 'DPD', Status: 'Mendatang' }
    ],
    presensiList: [],
    mutabaahList: [],
    wilayahList: KECAMATAN_LEBAK,
    jenjangList: JENJANG_KADER,
    rekrutmenList: [
      { ID: 'REK-001', NamaCalon: 'Bambang Sudrajat, S.E.', NIK_KTP: '3602101505880001', JK: 'Ikhwan', NoWA: '081311223344', Kecamatan: 'Rangkasbitung', Desa: 'Muara Ciujung Barat', LatarBelakang: 'Tokoh Masyarakat', PJ_KaderID: 'KDR-001', PJ_Nama: 'Murobbi', PJ_Jenjang: 'Madya', Status: 'Pendekatan Intensif', TanggalRekrut: '2026-09-01', Catatan: 'Berminat bergabung, rutin diajak kajian pekanan' },
      { ID: 'REK-002', NamaCalon: 'Dewi Sartika, S.Pd', NIK_KTP: '3602102008920002', JK: 'Akhwat', NoWA: '085812345678', Kecamatan: 'Rangkasbitung', Desa: 'Cijoro Pasir', LatarBelakang: 'Guru / Akademisi', PJ_KaderID: 'KDR-004', PJ_Nama: 'Usth. Siti Khadijah, S.Ag', PJ_Jenjang: 'Madya', Status: 'Siap DMP', TanggalRekrut: '2026-09-03', Catatan: 'Siap ikut Daurah Marhalah Pemula bulan ini' },
      { ID: 'REK-003', NamaCalon: 'Hendri Kurniawan', NIK_KTP: '3602101012970003', JK: 'Ikhwan', NoWA: '087799887766', Kecamatan: 'Warunggunung', Desa: 'Baros', LatarBelakang: 'Pemuda Karang Taruna', PJ_KaderID: 'KDR-001', PJ_Nama: 'Murobbi', PJ_Jenjang: 'Madya', Status: 'Prospek', TanggalRekrut: '2026-09-05', Catatan: 'Aktif di kegiatan bakti sosial kepemudaan' }
    ],
    mutasiList: [
      { ID: 'MUT-001', TipeMutasi: 'Mutasi Masuk', KaderID: '', NamaKader: 'Dr. H. Agus Suryana, M.Si', Jenjang: 'Dewasa', JK: 'Ikhwan', NoWA: '081288990011', AsalDaerah: 'DPD PKS Tangerang Selatan', TujuanDaerah: 'Rangkasbitung (Dapil 1)', TanggalMutasi: '2026-09-02', NoSuratMutasi: '012/SM-IN/BKAP-LBK/IX/2026', StatusApproval: 'Disetujui', Alasan: 'Pindah tugas dinas ke RSUD Adjidarmo Lebak' },
      { ID: 'MUT-002', TipeMutasi: 'Mutasi Keluar', KaderID: 'KDR-003', NamaKader: 'Kader', Jenjang: 'Muda', JK: 'Ikhwan', NoWA: '085712345678', AsalDaerah: 'Warunggunung (Dapil 1)', TujuanDaerah: 'DPD PKS Kota Serang', TanggalMutasi: '2026-09-04', NoSuratMutasi: '015/SM-OUT/BKAP-LBK/IX/2026', StatusApproval: 'Menunggu Verifikasi', Alasan: 'Melanjutkan studi S2 di Untirta Serang' },
      { ID: 'MUT-003', TipeMutasi: 'Mutasi Masuk', KaderID: '', NamaKader: 'Siti Maryam, S.Farm', Jenjang: 'Pratama', JK: 'Akhwat', NoWA: '081922334455', AsalDaerah: 'DPD PKS Kab. Bogor', TujuanDaerah: 'Maja (Dapil 2)', TanggalMutasi: '2026-09-05', NoSuratMutasi: '018/SM-IN/BKAP-LBK/IX/2026', StatusApproval: 'Menunggu Verifikasi', Alasan: 'Pindah domisili mengikuti suami di Citra Maja Raya' }
    ],
    laporanBkapList: [
      { ID: 'RPT-001', NamaAgenda: 'Daurah Marhalah Pemula (DMP) Zona Lebak Selatan', Tanggal: '2026-08-25', Lokasi: 'Aula Hotel Rahayu Malingping', Kategori: 'Daurah', TargetPeserta: 60, RealisasiPeserta: 56, PJ_Agenda: 'Ust. Lukman Hakim (BKAP Lebak Selatan)', Status: 'Selesai Dilaporkan', EvaluasiKualitatif: 'Peserta antusias, kehadiran mencapai 93.3%. Seluruh peserta siap ditempatkan ke 4 UPA baru.', DokumentasiUrl: '' },
      { ID: 'RPT-002', Pelatihan: 'Pelatihan Murabbi & Upgrading UPA Se-Lebak', NamaAgenda: 'Pelatihan Murabbi & Upgrading UPA Se-Lebak', Tanggal: '2026-08-30', Lokasi: 'Aula DPD PKS Lebak', Kategori: 'Pelatihan Murabbi', TargetPeserta: 40, RealisasiPeserta: 38, PJ_Agenda: 'Bidang Kaderisasi BKAP DPD', Status: 'Selesai Dilaporkan', EvaluasiKualitatif: 'Tingkat kehadiran 95%. Materi silabus dan metode mutabaah digital TAPAK LEBAK tersampaikan tuntas.', DokumentasiUrl: '' },
      { ID: 'RPT-003', NamaAgenda: 'Ta\'lim Bulanan Kader & Konsolidasi BKAP', Tanggal: '2026-09-06', Lokasi: 'Gedung PGRI Rangkasbitung', Kategori: 'Ta\'lim Bulanan', TargetPeserta: 250, RealisasiPeserta: 235, PJ_Agenda: 'Sekretaris BKAP DPD Lebak', Status: 'Selesai Dilaporkan', EvaluasiKualitatif: 'Capaian 94%. Disosialisasikan target rekrutmen anggota eksternal per DPC.', DokumentasiUrl: '' }
    ],
    config: APP_CONFIG
  };
}

/**
 * API: Login Pengguna
 * Dioptimalkan dengan pencocokan instan tanpa overhead query sheet yang berat
 * @param {string} username
 * @param {string} password
 * @param {string} requestedRole (opsional)
 */
function apiLogin(username, password, requestedRole) {
  try {
    const cleanUser = String(username || '').trim().toLowerCase();
    const cleanPass = String(password || '').trim();

    // 1. Cek langsung akun bawaan / demo cepat (respon kilat <5ms)
    const quickAccounts = [
      { ID: 'USR-001', Username: 'admin', Password: 'admin123', Role: 'Super Admin', Nama: 'Admin DPD PKS Lebak', Kecamatan: 'Rangkasbitung' },
      { ID: 'USR-002', Username: 'ketua', Password: 'ketua123', Role: 'Ketua DPD', Nama: 'Lily Sugianto (Ketua DPD)', Kecamatan: 'Rangkasbitung' },
      { ID: 'USR-003', Username: 'bkap', Password: 'bkap123', Role: 'BKAP DPD', Nama: 'Ketua BKAP DPD Lebak', Kecamatan: 'Rangkasbitung' },
      { ID: 'USR-004', Username: 'pembimbing', Password: 'murabbi123', Role: 'Pembimbing', Nama: 'Murobbi', Kecamatan: 'Rangkasbitung' },
      { ID: 'USR-005', Username: 'kader', Password: 'kader123', Role: 'Kader', Nama: 'Kader', Kecamatan: 'Warunggunung' }
    ];

    const quickMatch = quickAccounts.find(u => 
      u.Username.toLowerCase() === cleanUser && u.Password === cleanPass
    );

    if (quickMatch) {
      return {
        status: 'success',
        message: 'Login berhasil!',
        user: {
          id: quickMatch.ID,
          username: quickMatch.Username,
          role: requestedRole || quickMatch.Role,
          nama: quickMatch.Nama,
          kecamatan: quickMatch.Kecamatan,
          loginAt: Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss')
        }
      };
    }

    // 2. Jika bukan akun bawaan, baca DB_USERS di Google Sheets
    const ss = getSpreadsheet();
    let users = readSheetData(ss, SHEETS.USERS);
    
    if (users && users.length > 0) {
      const user = users.find(u => 
        String(u.Username).toLowerCase() === cleanUser && 
        String(u.Password) === cleanPass
      );
      
      if (user) {
        return {
          status: 'success',
          message: 'Login berhasil!',
          user: {
            id: user.ID,
            username: user.Username,
            role: requestedRole || user.Role,
            nama: user.Nama,
            kecamatan: user.Kecamatan || 'Kabupaten Lebak',
            loginAt: Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss')
          }
        };
      }
    }

    return { status: 'error', message: 'Username atau Password salah!' };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * API: Ambil Konfigurasi Logo & Parameter Aplikasi
 */
function apiGetAppConfig() {
  return {
    status: 'success',
    config: APP_CONFIG
  };
}

/**
 * ==========================================================================
 * GOOGLE DRIVE DYNAMIC FILE UPLOADER & MANAGEMENT
 * ==========================================================================
 */

/**
 * Helper: Dapatkan atau buat otomatis Folder Google Drive untuk TAPAK LEBAK
 */
function getOrCreateDriveFolder(subfolderCategory) {
  const rootFolders = DriveApp.getFoldersByName(DRIVE_CONFIG.PARENT_FOLDER);
  let parentFolder;
  if (rootFolders.hasNext()) {
    parentFolder = rootFolders.next();
  } else {
    parentFolder = DriveApp.createFolder(DRIVE_CONFIG.PARENT_FOLDER);
    parentFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }

  const subName = (DRIVE_CONFIG.SUBFOLDERS && DRIVE_CONFIG.SUBFOLDERS[subfolderCategory]) ? DRIVE_CONFIG.SUBFOLDERS[subfolderCategory] : 'Umum';
  const subFolders = parentFolder.getFoldersByName(subName);
  let targetFolder;
  if (subFolders.hasNext()) {
    targetFolder = subFolders.next();
  } else {
    targetFolder = parentFolder.createFolder(subName);
    targetFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }
  return targetFolder;
}

/**
 * API: Upload Berkas dari Perangkat (Base64) ke Google Drive
 * Mengonversi file ke direct link lh3.googleusercontent.com
 * @param {Object} filePayload { base64Data, fileName, mimeType, category }
 */
function apiUploadFile(filePayload) {
  try {
    if (!filePayload || !filePayload.base64Data) {
      return { status: 'error', message: 'Data file tidak valid atau kosong.' };
    }

    const category = filePayload.category || 'BRANDING';
    const folder = getOrCreateDriveFolder(category);

    // Ambil raw base64 string jika memiliki prefix DataURL (misal: "data:image/jpeg;base64,....")
    let rawBase64 = filePayload.base64Data;
    if (rawBase64.indexOf(',') > -1) {
      rawBase64 = rawBase64.split(',')[1];
    }

    const decodedBytes = Utilities.base64Decode(rawBase64);
    const mimeType = filePayload.mimeType || 'image/png';
    const originalName = filePayload.fileName || ('upload_' + Date.now() + '.png');
    const safeFileName = 'TAPAK LEBAK_' + category + '_' + Date.now() + '_' + originalName.replace(/[^a-zA-Z0-9._-]/g, '_');

    const blob = Utilities.newBlob(decodedBytes, mimeType, safeFileName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const fileId = file.getId();
    // Direct rendering link Google Drive
    const directUrl = 'https://lh3.googleusercontent.com/d/' + fileId;
    const fallbackUrl = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w800';

    return {
      status: 'success',
      message: 'File berhasil diunggah ke Google Drive!',
      fileId: fileId,
      directUrl: directUrl,
      fallbackUrl: fallbackUrl,
      driveUrl: file.getUrl(),
      fileName: safeFileName
    };
  } catch (err) {
    return { status: 'error', message: 'Gagal mengunggah ke Google Drive: ' + err.toString() };
  }
}

/**
 * API: Simpan Kustomisasi Branding (Logo & Banner) ke DB_CONFIG
 * @param {Object} brandingData { logoUrl, bannerUrl }
 */
function apiSaveBrandingConfig(brandingData) {
  try {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName(SHEETS.CONFIG);
    if (!sheet) initDatabase();
    sheet = ss.getSheetByName(SHEETS.CONFIG);

    const values = sheet.getDataRange().getValues();
    
    function upsertConfig(key, val, desc) {
      let found = false;
      for (let i = 1; i < values.length; i++) {
        if (values[i][0] === key) {
          sheet.getRange(i + 1, 2).setValue(val);
          found = true;
          break;
        }
      }
      if (!found) {
        sheet.appendRow([key, val, desc || '']);
      }
    }

    if (brandingData.logoUrl) {
      const normalizedLogo = normalizeDriveImageUrl(brandingData.logoUrl);
      upsertConfig('LOGO_URL', normalizedLogo.directUrl, 'Link Logo Utama');
      if (normalizedLogo.driveId) {
        upsertConfig('LOGO_DRIVE_ID', normalizedLogo.driveId, 'Google Drive File ID');
      }
    }
    if (brandingData.bannerUrl) {
      const normalizedBanner = normalizeDriveImageUrl(brandingData.bannerUrl);
      upsertConfig('BANNER_HERO_URL', normalizedBanner.directUrl, 'Link Banner Hero Dashboard');
    }

    return { status: 'success', message: 'Konfigurasi branding berhasil diperbarui!' };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * API: Simpan Perubahan Logo (CRUD Logo) ke Baris ke-2 Kolom B sheet DB_CONFIG
 * Mendukung input URL sharing Drive, direct link, maupun File ID
 * @param {string} logoInput
 */
function apiSaveLogoConfig(logoInput) {
  try {
    if (!logoInput || typeof logoInput !== 'string') {
      return { status: 'error', message: 'Input logo tidak valid atau kosong.' };
    }

    let directUrlToSave = logoInput.trim();

    // =========================================================================
    // PROTEKSI KUOTA SEL GOOGLE SPREADSHEET (BATAS MAKSIMAL 50.000 KARAKTER)
    // Jika input adalah Base64 data URL atau string raksasa (>2.000 karakter):
    // Otomatis unggah sebagai file ke Google Drive agar menghasilkan URL ringkas (~65 char)
    // =========================================================================
    if (directUrlToSave.startsWith('data:image/') || directUrlToSave.length > 2000) {
      try {
        const uploadRes = apiUploadFile({
          base64Data: directUrlToSave,
          fileName: 'logo_tapak_lebak_' + Date.now() + '.jpg',
          mimeType: 'image/jpeg',
          category: 'BRANDING'
        });
        if (uploadRes && uploadRes.status === 'success' && uploadRes.directUrl) {
          directUrlToSave = uploadRes.directUrl;
        } else {
          return {
            status: 'error',
            message: 'Gagal mengunggah gambar ke Google Drive: ' + (uploadRes.message || 'Unknown error')
          };
        }
      } catch (uploadErr) {
        return {
          status: 'error',
          message: 'Gagal memproses gambar Base64 ke Google Drive: ' + uploadErr.toString()
        };
      }
    }

    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName(SHEETS.CONFIG);
    if (!sheet) initDatabase();
    sheet = ss.getSheetByName(SHEETS.CONFIG);

    const normalized = normalizeDriveImageUrl(directUrlToSave);

    // Hard Guard: Jangan pernah menulis teks > 2000 karakter ke sel spreadsheet
    if (normalized.directUrl && normalized.directUrl.length > 2000) {
      return {
        status: 'error',
        message: 'Panjang link logo melebihi batas aman (maks 2.000 karakter). Gunakan file upload dari komputer.'
      };
    }

    // Pastikan tersimpan di baris ke-2 kolom B (atau key LOGO_URL)
    const values = sheet.getDataRange().getValues();
    let updated = false;

    for (let i = 1; i < values.length; i++) {
      const key = String(values[i][0]).trim().toUpperCase();
      if (key === 'LOGO_URL' || key === 'LOGO' || i === 1) {
        sheet.getRange(i + 1, 2).setValue(normalized.directUrl);
        updated = true;
        break;
      }
    }

    if (!updated) {
      sheet.appendRow(['LOGO_URL', normalized.directUrl, 'Link Langsung Logo Google Drive']);
    }

    // Invalidate initial data cache agar tampilan langsung terupdate
    try {
      if (typeof invalidateInitialDataCache === 'function') {
        invalidateInitialDataCache();
      }
    } catch (cacheErr) {
      console.warn('Cache invalidation warning:', cacheErr);
    }

    return {
      status: 'success',
      message: 'Logo resmi berhasil diperbarui di Google Sheets DB_CONFIG!',
      data: normalized
    };
  } catch (err) {
    return { status: 'error', message: 'Gagal menyimpan logo: ' + err.toString() };
  }
}

/**
 * API: Reset Logo ke Default DPD PKS Lebak
 */
function apiResetLogoConfig() {
  return apiSaveLogoConfig(APP_CONFIG.LOGO_PRIMARY);
}

