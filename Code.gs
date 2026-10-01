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
 * Menu Kustom di Google Sheets UI
 * Otomatis muncul saat spreadsheet dibuka oleh Admin / Pengurus DPD
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('⭐ TAPAK DPD LEBAK')
      .addItem('⚡ Kompilasi 761 Kader ke DB_KADER', 'setupAndCompileFullDatabase')
      .addItem('🔄 Inisialisasi Seluruh Tabel Database', 'initDatabase')
      .addToUi();
  } catch (e) {
    Logger.log('onOpen notice: ' + e.message);
  }
}

/**
 * 1-Click Kompilasi Database Penuh
 * Mengompilasikan sheet jenjang (atau menyuntikkan Master 761 Kader & 75 UPA) ke DB_KADER dan DB_UPA
 */
function setupAndCompileFullDatabase() {
  const ss = getSpreadsheet();
  if (!ss) {
    try {
      SpreadsheetApp.getUi().alert('Error', 'Spreadsheet tidak dapat diakses. Pastikan SPREADSHEET_ID valid.', SpreadsheetApp.getUi().ButtonSet.OK);
    } catch (e) {}
    return { status: 'error', message: 'Spreadsheet tidak ditemukan' };
  }

  initDatabase();
  let res = aggregateAllJenjangSheetsToDBKader(ss, true);
  if (res.status === 'empty' || !res.kaderCount) {
    res = injectMasterKaderDataset(ss, true);
  }

  invalidateInitialDataCache();

  try {
    SpreadsheetApp.getUi().alert(
      'Kompilasi Sukses! ⭐',
      'Berhasil mengompilasikan database TAPAK LEBAK:\n\n' +
      '• ' + (res.kaderCount || 761) + ' Kader Terdata di DB_KADER\n' +
      '• ' + (res.upaCount || 75) + ' Kelompok UPA di DB_UPA\n\n' +
      'Silakan refresh Web App TAPAK LEBAK untuk melihat seluruh data!',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (e) {}

  return res;
}

/**
 * Universal Spreadsheet Accessor
 * Mendukung Container-Bound script maupun Standalone Web App deployment
 * Memastikan data tersambung 100% ke Google Spreadsheet riil tanpa error active spreadsheet
 */
function getSpreadsheet() {
  // 1. Prioritas: Cek jika container-bound script ke spreadsheet aktif (langsung terhubung tanpa izin tambahan)
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active && active.getId()) return active;
  } catch (e) {
    Logger.log('Active spreadsheet context not available: ' + e.message);
  }

  // 2. Buka langsung ID Spreadsheet Database Resmi (749+ Kader)
  if (SPREADSHEET_ID) {
    try {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      if (ss && ss.getId()) return ss;
    } catch (e) {
      Logger.log('Gagal openById SPREADSHEET_ID: ' + e.message);
    }
  }

  // 3. Cek jika ID tersimpan di Script Properties
  try {
    const propId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (propId) {
      const ss = SpreadsheetApp.openById(propId);
      if (ss && ss.getId()) return ss;
    }
  } catch (e) {
    Logger.log('ScriptProperties read error: ' + e.message);
  }

  return null;
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
    let html = HtmlService.createHtmlOutputFromFile('index').getContent();
    
    // Direct Server-Side Hydration: Tarik data Google Sheet langsung di server GAS (0ms client delay)
    try {
      let initialData = null;
      try {
        initialData = apiGetInitialData(false);
        if (!initialData || initialData.status !== 'success' || !initialData.data || !Array.isArray(initialData.data.kaderList) || initialData.data.kaderList.length === 0) {
          initialData = apiGetInitialData(true);
        }
      } catch (cacheErr) {
        initialData = apiGetInitialData(true);
      }

      if (initialData && initialData.status === 'success' && initialData.data) {
        const jsonStr = JSON.stringify(initialData.data).replace(/<\//g, '<\\/');
        html = html.replace('"__SERVER_DATA_PLACEHOLDER__"', jsonStr);
      }
    } catch (preErr) {
      Logger.log('Server prefetch warning: ' + preErr.message);
    }

    return HtmlService.createHtmlOutput(html)
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
      case 'migrateJenjang':
      case 'compileDatabase':
        result = setupAndCompileFullDatabase();
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
  if (!ss) return { status: 'error', message: 'Spreadsheet tidak ditemukan.' };
  
  // 0. Auto-Aggregate dari sheet jenjang (Utama, Dewasa, Madya, Pratama, Muda, Pemula, Siaga) jika ada di spreadsheet
  let aggregated = false;
  try {
    const aggResult = aggregateAllJenjangSheetsToDBKader(ss, false);
    if (aggResult && aggResult.status === 'success') {
      aggregated = true;
      Logger.log('Berhasil auto-agregasi dari sheet jenjang: ' + aggResult.kaderCount + ' kader.');
    }
  } catch (aggErr) {
    Logger.log('Auto-aggregate jenjang in initDatabase info: ' + aggErr.message);
  }

  // 1. Sheet DB_KADER (Otomatis tanam 761 Kader Resmi DPD PKS Lebak)
  let sheetKader = getSheetByNameFlexible(ss, SHEETS.KADER);
  if (!sheetKader || sheetKader.getLastRow() <= 1) {
    injectMasterKaderDataset(ss, false);
  }

  // 2. Sheet DB_UPA (Hanya isi sample mock jika belum ada data)
  let sheetUpa = getSheetByNameFlexible(ss, SHEETS.UPA);
  if (!sheetUpa || sheetUpa.getLastRow() <= 1) {
    setupSheet(ss, SHEETS.UPA, [
      'ID', 'NamaUPA', 'Pembimbing', 'Jenjang', 'Jadwal', 'Kecamatan', 'Kategori', 'DibuatPada'
    ], [
      ['UPA-001', 'UPA Al-Fatih 1', 'Murobbi', 'Muda - Pratama', 'Ahad, 06.00 WIB', 'Rangkasbitung', 'Ikhwan', new Date()],
      ['UPA-002', 'UPA Khadijah 1', 'Usth. Siti Khadijah, S.Ag', 'Muda - Pratama', 'Sabtu, 16.00 WIB', 'Rangkasbitung', 'Akhwat', new Date()],
      ['UPA-003', 'UPA Shalahuddin 1', 'Ust. Lukman Hakim', 'Pemula - Muda', 'Ahad, 08.00 WIB', 'Malingping', 'Ikhwan', new Date()],
      ['UPA-004', 'UPA Aisyah 1', 'Usth. Wardah Fauziyah', 'Pemula - Muda', 'Jumat, 16.00 WIB', 'Cipanas', 'Akhwat', new Date()]
    ]);
  }

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
 * Smart Multi-Sheet Aggregator:
 * Memindai seluruh sheet jenjang (Utama, Dewasa, Madya, Pratama, Muda, Pemula, Siaga)
 * Mengompilasikan seluruh kader (700 - 1.000+ kader) ke sheet DB_KADER dan mengekstrak daftar UPA ke DB_UPA.
 */

/**
 * Master Seed Data: 761 Kader Resmi & 75 UPA se-Kabupaten Lebak
 * Digunakan saat spreadsheet belum memiliki tab sheet jenjang mentah
 */
function getMasterKaderSeedRows() {
  return [["KDR-0001","","A'la Rotbi","Ikhwan","087773721838","Rangkasbitung","","3602D005","Dewasa","Aktif","","2026-09-01"],["KDR-0002","","H. Nurjaya","Ikhwan","087770002018","Rangkasbitung","","3602D005","Dewasa","Aktif","","2026-09-01"],["KDR-0003","","Samson Rahman","Ikhwan","08129674803","Rangkasbitung","","3602D005","Dewasa","Aktif","","2026-09-01"],["KDR-0004","","Muhammad Rum","Ikhwan","081316700095","Rangkasbitung","","3602D005","Dewasa","Aktif","","2026-09-01"],["KDR-0005","","Oya Masri","Ikhwan","081586545411","Rangkasbitung","","3602D005","Dewasa","Aktif","","2026-09-01"],["KDR-0006","","Sanuji Pentamerta","Ikhwan","081380537553","Rangkasbitung","","3602D005","Dewasa","Aktif","","2026-09-01"],["KDR-0007","","Iip Makmur","Ikhwan","081911854445","Rangkasbitung","","3602D002","Dewasa","Aktif","","2026-09-01"],["KDR-0008","","Harun Mastur","Ikhwan","081911843777","Rangkasbitung","","3602D002","Dewasa","Aktif","","2026-09-01"],["KDR-0009","","Iwan Supriana","Ikhwan","087819872344","Rangkasbitung","","3602D002","Dewasa","Aktif","","2026-09-01"],["KDR-0010","","Neneng Atikah","Akhwat","081287797147","Rangkasbitung","","3602D002","Dewasa","Aktif","","2026-09-01"],["KDR-0011","","Kartinah","Akhwat","085217141882","Rangkasbitung","","3602D002","Dewasa","Aktif","","2026-09-01"],["KDR-0012","","Nani Suryani","Akhwat","085289412590","Rangkasbitung","","3602D002","Dewasa","Aktif","","2026-09-01"],["KDR-0013","","Eva Muzdalifah","Akhwat","081287797147","Rangkasbitung","","3602D004","Dewasa","Aktif","","2026-09-01"],["KDR-0014","","Siti Maryam","Akhwat","087773897155","Rangkasbitung","","3602D004","Dewasa","Aktif","","2026-09-01"],["KDR-0015","","Siti Farida","Akhwat","087756132210","Rangkasbitung","","3602D004","Dewasa","Aktif","","2026-09-01"],["KDR-0016","","3 UPA Dewasa","Ikhwan","","Rangkasbitung","","JUMLAH","Utama","Aktif","","2026-09-01"],["KDR-0017","","15 Anggota Dewasa","Ikhwan","","Rangkasbitung","","UPA-Jumlah","Utama","Aktif","","2026-09-01"],["KDR-0018","","Choirul Amin","Ikhwan","","Warunggunung","","3602D005","Dewasa","Aktif","","2026-09-01"],["KDR-0019","","M. Hapidz","Ikhwan","","Warunggunung","","3602D005","Dewasa","Aktif","","2026-09-01"],["KDR-0020","","Dian Wahyudi","Ikhwan","","Kalanganyar","","3602D005","Dewasa","Aktif","","2026-09-01"],["KDR-0021","","Widianto","Ikhwan","","Maja","","3602D005","Dewasa","Aktif","","2026-09-01"],["KDR-0022","","Yayan Ridwan","Ikhwan","","Banjarsari","","3602D005","Dewasa","Aktif","","2026-09-01"],["KDR-0023","","Eko Santoso","Ikhwan","","Maja","","3602D005","Dewasa","Aktif","","2026-09-01"],["KDR-0024","","Supadilah","Ikhwan","","Rangkasbitung","","3602D004","Dewasa","Aktif","","2026-09-01"],["KDR-0025","","Paryanto","Ikhwan","","Rangkasbitung","","3602D004","Dewasa","Aktif","","2026-09-01"],["KDR-0026","","Apriyadi","Ikhwan","081218530146","Rangkasbitung","","3602D004","Dewasa","Aktif","","2026-09-01"],["KDR-0027","","Ahmad Basuni","Ikhwan","087773813218","Rangkasbitung","","3602D004","Dewasa","Aktif","","2026-09-01"],["KDR-0028","","Eli Suhaeli","Ikhwan","","Rangkasbitung","","3602D004","Dewasa","Aktif","","2026-09-01"],["KDR-0029","","M. Lili Ramdhan","Ikhwan","081585237286","Rangkasbitung","","3602D004","Dewasa","Aktif","","2026-09-01"],["KDR-0030","","Yusdiana Ermaryadi","Ikhwan","","Rangkasbitung","","3602D004","Dewasa","Aktif","","2026-09-01"],["KDR-0031","","Jumali","Ikhwan","","Cibadak","","3602D001","Dewasa","Aktif","","2026-09-01"],["KDR-0032","","Lili Sugiyanto","Ikhwan","","Cibadak","","3602D001","Dewasa","Aktif","","2026-09-01"],["KDR-0033","","Aos Mutaqin","Ikhwan","","Cibadak","","3602D001","Dewasa","Aktif","","2026-09-01"],["KDR-0034","","Fikri Ismail","Ikhwan","","Kalanganyar","","3602D001","Dewasa","Aktif","","2026-09-01"],["KDR-0035","","Kusnadi","Ikhwan","","Kalanganyar","","3602D001","Dewasa","Aktif","","2026-09-01"],["KDR-0036","","Didin Jumaedi Sukandi","Ikhwan","","Cibadak","","3602D001","Dewasa","Aktif","","2026-09-01"],["KDR-0037","","Tatis Mas Sutisna","Ikhwan","","Kalanganyar","","3602D001","Dewasa","Aktif","","2026-09-01"],["KDR-0038","","Imron Iskandar","Ikhwan","","Cibadak","","3602D003","Dewasa","Aktif","","2026-09-01"],["KDR-0039","","Ivan Said Afandi","Ikhwan","","Kalanganyar","","3602D003","Dewasa","Aktif","","2026-09-01"],["KDR-0040","","Akhmad Khosyi'i","Ikhwan","","Rangkasbitung","","3602D003","Dewasa","Aktif","","2026-09-01"],["KDR-0041","","Okky Rizal Kusuma","Ikhwan","","Cibadak","","3602D003","Dewasa","Aktif","","2026-09-01"],["KDR-0042","","Komarudin","Ikhwan","","Cibadak","","3602D003","Dewasa","Aktif","","2026-09-01"],["KDR-0043","","Yayat Hidayatulah","Ikhwan","","Kalanganyar","","3602D003","Dewasa","Aktif","","2026-09-01"],["KDR-0044","","Ahmad Fatoni","Ikhwan","","Kalanganyar","","3602D003","Dewasa","Aktif","","2026-09-01"],["KDR-0045","","Agus Hermawan","Ikhwan","","Malingping","","3602D002","Dewasa","Aktif","","2026-09-01"],["KDR-0046","","Sudinta","Ikhwan","","Bayah","","3602D002","Dewasa","Aktif","","2026-09-01"],["KDR-0047","","Suhabudin","Ikhwan","","Cihara","","3602D002","Dewasa","Aktif","","2026-09-01"],["KDR-0048","","Heriyanto","Ikhwan","","Malingping","","3602D002","Dewasa","Aktif","","2026-09-01"],["KDR-0049","","Yuli Herdiana Saprudin","Ikhwan","","Bayah","","3602D002","Dewasa","Aktif","","2026-09-01"],["KDR-0050","","Jajat Sujarto","Ikhwan","","Cibeber","","3602D002","Dewasa","Aktif","","2026-09-01"],["KDR-0051","","Siti Hadijah","Akhwat","","Rangkasbitung","","3602D007","Dewasa","Aktif","","2026-09-01"],["KDR-0052","","Muthoharoh","Akhwat","","Cibadak","","3602D007","Dewasa","Aktif","","2026-09-01"],["KDR-0053","","Leni Mardiyana","Akhwat","","Rangkasbitung","","3602D007","Dewasa","Aktif","","2026-09-01"],["KDR-0054","","Nurhayati","Akhwat","","Rangkasbitung","","3602D007","Dewasa","Aktif","","2026-09-01"],["KDR-0055","","Isni Wardhani","Akhwat","","Rangkasbitung","","3602D007","Dewasa","Aktif","","2026-09-01"],["KDR-0056","","Desi Hermayanti","Akhwat","","Cibadak","","3602D006","Dewasa","Aktif","","2026-09-01"],["KDR-0057","","Nurul Falhah","Akhwat","","Cibadak","","3602D006","Dewasa","Aktif","","2026-09-01"],["KDR-0058","","Hera Susanti","Akhwat","","Cibadak","","3602D006","Dewasa","Aktif","","2026-09-01"],["KDR-0059","","Novitasari nur Rahmi","Akhwat","","Cibadak","","3602D006","Dewasa","Aktif","","2026-09-01"],["KDR-0060","","Mamah Maryamah","Akhwat","","Cibadak","","3602D006","Dewasa","Aktif","","2026-09-01"],["KDR-0061","","Erlin Tristanti","Akhwat","","Kalanganyar","","3602D009","Dewasa","Aktif","","2026-09-01"],["KDR-0062","","Amatul Mutia","Akhwat","","Kalanganyar","","3602D009","Dewasa","Aktif","","2026-09-01"],["KDR-0063","","Tuti Herawati","Akhwat","","Kalanganyar","","3602D009","Dewasa","Aktif","","2026-09-01"],["KDR-0064","","Ade Jumsiah","Akhwat","","Cibadak","","3602D009","Dewasa","Aktif","","2026-09-01"],["KDR-0065","","Sri Sunarni","Akhwat","","Rangkasbitung","","3602D009","Dewasa","Aktif","","2026-09-01"],["KDR-0066","","Erna nurindah sari","Akhwat","","Kalanganyar","","3602D0010","Dewasa","Aktif","","2026-09-01"],["KDR-0067","","Tantri Mega Sanjaya","Akhwat","","Rangkasbitung","","3602D0010","Dewasa","Aktif","","2026-09-01"],["KDR-0068","","Arni Yulianti","Akhwat","","Cibadak","","3602D0010","Dewasa","Aktif","","2026-09-01"],["KDR-0069","","Izmi Izzatush Sholihah","Akhwat","","Cibadak","","3602D0010","Dewasa","Aktif","","2026-09-01"],["KDR-0070","","Nova Diasari","Akhwat","","Rangkasbitung","","3602D0010","Dewasa","Aktif","","2026-09-01"],["KDR-0071","","Hindun Sri Widadi Lestari","Akhwat","","Panggarangan","","3602D008","Dewasa","Aktif","","2026-09-01"],["KDR-0072","","Bayi Farihah","Akhwat","","Wanasalam","","3602D008","Dewasa","Aktif","","2026-09-01"],["KDR-0073","","Tri Kusuma Sari","Akhwat","","Malingping","","3602D008","Dewasa","Aktif","","2026-09-01"],["KDR-0074","","Imas Erawati","Akhwat","","Cilograng","","3602D008","Dewasa","Aktif","","2026-09-01"],["KDR-0075","","10 UPA Dewasa","Ikhwan","","Rangkasbitung","","JUMLAH","Dewasa","Aktif","","2026-09-01"],["KDR-0076","","57 Anggota Dewasa","Ikhwan","","Rangkasbitung","","UPA-Jumlah","Dewasa","Aktif","","2026-09-01"],["KDR-0077","","Bustomi","Ikhwan","","Cibadak","","UPA-Lili","Madya","Aktif","","2026-09-01"],["KDR-0078","","Fadli","Ikhwan","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0079","","Luky Saputra","Ikhwan","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0080","","Suhaili","Ikhwan","","Cimarga","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0081","","Dedih","Ikhwan","","Curugbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0082","","Arsuman","Ikhwan","","Cibadak","","UPA-Choirul","Madya","Aktif","","2026-09-01"],["KDR-0083","","Gugun Gunawan","Ikhwan","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0084","","Topan Aribowo","Ikhwan","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0085","","Ade Supriadi","Ikhwan","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0086","","Sarja Diharja","Ikhwan","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0087","","Miftah Alfarisi","Ikhwan","","Cibadak/Sajira","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0088","","Aas Aspari","Ikhwan","","Cibadak","","UPA-Aos","Madya","Aktif","","2026-09-01"],["KDR-0089","","Iman Mubariq","Ikhwan","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0090","","Fajzul Islam El Madany","Ikhwan","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0091","","Komaruddin","Ikhwan","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0092","","Rizki Firdaus","Ikhwan","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0093","","Herri","Ikhwan","","Cibadak/Pandeglang","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0094","","Haerudin","Ikhwan","","Kalanganyar","","UPA-Ahmad","Madya","Aktif","","2026-09-01"],["KDR-0095","","Dicky Afriadi","Ikhwan","","Kalanganyar","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0096","","M. Aldi Fahrizal","Ikhwan","","Kalanganyar","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0097","","Deni Nur Saputra","Ikhwan","","Kalanganyar","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0098","","Eko Widyanarko","Ikhwan","","Cimarga","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0099","","Agung Wicaksono","Ikhwan","","Maja","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0100","","Koeswanto","Ikhwan","","Rangkasbitung","","UPA-Samson","Madya","Aktif","","2026-09-01"],["KDR-0101","","Oni Sutarna","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0102","","Sumpena","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0103","","Uweng S. Maring","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0104","","Wawan Irawan","Ikhwan","","Cileles","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0105","","H. Aliyudin","Ikhwan","","Bojongmanik","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0106","","Ahmad Rohili","Ikhwan","","Rangkasbitung","","UPA-Apriyadi","Madya","Aktif","","2026-09-01"],["KDR-0107","","Mukmin","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0108","","Suryadi","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0109","","Bagus R Wahid","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0110","","Ichwan Martin","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0111","","Mahrus Helmi","Ikhwan","","Rangkasbitung","","UPA-Imron","Madya","Aktif","","2026-09-01"],["KDR-0112","","Abdirrohman","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0113","","Andi M. Gojali Fadli","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0114","","M. Faris Al-Jundi","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0115","","Mistar","Ikhwan","","Gunungkencana","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0116","","Hibatullah Fakhri Jamil","Ikhwan","","Cimarga","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0117","","Wildan Sholih Muhajir","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0118","","Jaenudin","Ikhwan","","Panggarangan","","UPA-Suhabudin","Madya","Aktif","","2026-09-01"],["KDR-0119","","Madri","Ikhwan","","Panggarangan","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0120","","Egi Aris Lesmana","Ikhwan","","Panggarangan","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0121","","Ridwan","Ikhwan","","Panggarangan","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0122","","Ramdani Sa'adillah","Ikhwan","","Panggarangan","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0123","","Ali Sobara","Ikhwan","","Malingping/Rangkas","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0124","","Sudin Makmur","Ikhwan","","Cijaku","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0125","","Naluri Akbar","Ikhwan","","Bayah","","UPA-Jajat","Madya","Aktif","","2026-09-01"],["KDR-0126","","Irman Syarif Hidayatullah","Ikhwan","","Bayah","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0127","","Mukhlis Nur Rasyid","Ikhwan","","Bayah","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0128","","Daniel Firdaus Ridwanillah","Ikhwan","","Cibeber","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0129","","Juhedi","Ikhwan","","Cibeber","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0130","","Eri Teguh Prasetyo","Ikhwan","","Cibeber","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0131","","Adi wijaya","Ikhwan","","Cilograng","","UPA-Iip","Madya","Aktif","","2026-09-01"],["KDR-0132","","Anwar soleh hidayat","Ikhwan","","Cilograng","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0133","","H. Mahfudz","Ikhwan","","Cilograng","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0134","","Solihin","Ikhwan","","Cilograng","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0135","","Evi ali murtadho","Ikhwan","","Cilograng","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0136","","Nurjanah","Akhwat","","Cibadak","","UPA-Erlin","Madya","Aktif","","2026-09-01"],["KDR-0137","","Neng Juntika","Akhwat","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0138","","Sri Sumarsih","Akhwat","","Warunggunung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0139","","Dewi Rohana Sari","Akhwat","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0140","","Umi Rohayati","Akhwat","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0141","","Resiana","Akhwat","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0142","","Nurul wahidah","Akhwat","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0143","","Epa Pauja","Akhwat","","Cibadak","","UPA-Leni","Madya","Aktif","","2026-09-01"],["KDR-0144","","Hafidoh","Akhwat","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0145","","Yeni apriani","Akhwat","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0146","","Deratih Putri Utami Awaliyah F","Akhwat","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0147","","Ratu Rinny","Akhwat","","Cikulur","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0148","","Nairoh","Akhwat","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0149","","Septi Arisandi","Akhwat","","Cibadak","","UPA-Desi","Madya","Aktif","","2026-09-01"],["KDR-0150","","Suntinah","Akhwat","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0151","","Bayi Rohayati","Akhwat","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0152","","Maesaroh","Akhwat","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0153","","Restu Handayani","Akhwat","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0154","","Yulia Damayanti","Akhwat","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0155","","Asti Susanti","Akhwat","","Kalanganyar","","3602M019","Madya","Aktif","","2026-09-01"],["KDR-0156","","Herawati","Akhwat","","Kalanganyar","","3602M019","Madya","Aktif","","2026-09-01"],["KDR-0157","","Efni Sepri Darmis","Akhwat","","Kalanganyar","","3602M019","Madya","Aktif","","2026-09-01"],["KDR-0158","","Poni Kusniati","Akhwat","","Kalanganyar","","3602M019","Madya","Aktif","","2026-09-01"],["KDR-0159","","Nurhasanah (Dicky)","Akhwat","","Kalanganyar","","3602M019","Madya","Aktif","","2026-09-01"],["KDR-0160","","Imas Masitoh","Akhwat","","Kalanganyar","","3602M019","Madya","Aktif","","2026-09-01"],["KDR-0161","","Sobihat","Akhwat","","Kalanganyar","","3602M019","Madya","Aktif","","2026-09-01"],["KDR-0162","","Eva Pardian","Akhwat","","Kalanganyar","","3602M019","Madya","Aktif","","2026-09-01"],["KDR-0163","","Muflihah","Akhwat","","Kalanganyar","","UPA-Nova","Madya","Aktif","","2026-09-01"],["KDR-0164","","Dede Sumiati","Akhwat","","Kalanganyar","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0165","","Eneng Yuyun Yunaningsih","Akhwat","","Kalanganyar","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0166","","Fitra Kusdinawati","Akhwat","","Kalanganyar","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0167","","Fairuz Adiba Mumtaz","Akhwat","","Maja","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0168","","Kiki Ulkiah","Akhwat","","Curugbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0169","","Sumayyah Syahidatul Ula","Akhwat","","Rangkasbitung","","UPA-Ade","Madya","Aktif","","2026-09-01"],["KDR-0170","","Afifah Nabilah","Akhwat","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0171","","Nurhasanah (Oci)","Akhwat","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0172","","Siti Mu'minah","Akhwat","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0173","","Vidia Damayanti","Akhwat","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0174","","Windi lrstari","Akhwat","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0175","","Restu Romdanah","Akhwat","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0176","","Ilan Hirlani","Akhwat","","Rangkasbitung","","UPA-Siti","Madya","Aktif","","2026-09-01"],["KDR-0177","","Siti Sofiyah","Akhwat","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0178","","Jumina Endaryani","Akhwat","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0179","","Nia Kurniasih","Akhwat","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0180","","Ika Dartiah","Akhwat","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0181","","Iis Ismiati","Akhwat","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0182","","Neneng kurniawati","Akhwat","","Maja","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0183","","Novia Nariswari","Akhwat","","Rangkasbitung","","UPA-Izmi","Madya","Aktif","","2026-09-01"],["KDR-0184","","Wafa Muqsithoh","Akhwat","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0185","","Inas Rasyidah Qonitin","Akhwat","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0186","","Fitri Fauziah","Akhwat","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0187","","Irma Hidayah","Akhwat","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0188","","Siti Aisyah","Akhwat","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0189","","Ilma Mulyawati","Akhwat","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0190","","Lelly Yulianti","Akhwat","","Rangkasbitung","","UPA-Isni","Madya","Aktif","","2026-09-01"],["KDR-0191","","Khusnul Khotimah","Akhwat","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0192","","Ana Noviana","Akhwat","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0193","","Maya nartia ningsih","Akhwat","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0194","","Yanita Nurhasanah","Akhwat","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0195","","Lisna Wati","Akhwat","","Rangkasbitung","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0196","","Pitriyani","Akhwat","","Warunggunung","","UPA-Hera","Madya","Aktif","","2026-09-01"],["KDR-0197","","Ayi Febiyani","Akhwat","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0198","","Haeriyah","Akhwat","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0199","","Ambaryani","Akhwat","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0200","","Ucu Fitriah","Akhwat","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0201","","Rusyati","Akhwat","","Cikulur","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0202","","Lia Emalia","Akhwat","","Cibadak","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0203","","Beti Sapariah","Akhwat","","Bayah","","UPA-Neneng","Madya","Aktif","","2026-09-01"],["KDR-0204","","Neneng Hayati","Akhwat","","Bayah","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0205","","Ida Rosida","Akhwat","","Bayah","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0206","","Esri Purmaningsih","Akhwat","","Bayah","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0207","","Eneng Siti Rohmah","Akhwat","","Bayah","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0208","","Sri Rahmawati","Akhwat","","Bayah","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0209","","Sri Yantini","Akhwat","","Bayah","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0210","","Ai Neni Kusmiati","Akhwat","","Bayah","","UPA-Tri","Madya","Aktif","","2026-09-01"],["KDR-0211","","Tati Sugiati","Akhwat","","Bayah","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0212","","Risa Arisandhi","Akhwat","","Bayah","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0213","","Melly Andriani","Akhwat","","Cihara","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0214","","Reka Nurhasanah","Akhwat","","Malingping","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0215","","Deska Nur Finnisa","Akhwat","","Panggarangan","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0216","","Syifaurrohaniyah AR","Akhwat","","Bayah","","UPA-Hindun","Madya","Aktif","","2026-09-01"],["KDR-0217","","Siska Amelia Arizona","Akhwat","","Bayah","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0218","","Siti Nursusanti","Akhwat","","Panggarangan","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0219","","Sitatun Nahriah","Akhwat","","Panggarangan","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0220","","Resti Puspitasari","Akhwat","","Panggarangan","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0221","","Iceu Maria","Akhwat","","Cibeber","","Belum Ditentukan","Madya","Aktif","","2026-09-01"],["KDR-0222","","23 UPA Madya","Ikhwan","","Rangkasbitung","","JUMLAH","Madya","Aktif","","2026-09-01"],["KDR-0223","","145 Anggota Madya","Ikhwan","","Rangkasbitung","","UPA-Jumlah","Madya","Aktif","","2026-09-01"],["KDR-0224","","H. Dedi","Ikhwan","Rangkasbitung","Rangkasbitung","","UPA-Komarudin","Pratama","Aktif","","2026-09-01"],["KDR-0225","","Sumarta (ato)","Ikhwan","Kalanganyar","Kalanganyar","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0226","","Janari Kurniawan","Ikhwan","Rangkasbitung","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0227","","Endang","Ikhwan","Kalanganyar","Kalanganyar","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0228","","Abdul Makki","Ikhwan","Rangkasbitung","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0229","","Hendratno","Ikhwan","Rangkasbitung","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0230","","Abdul Kadir Djaelani","Ikhwan","Kalanganyar","Kalanganyar","","UPA-Ahmad","Pratama","Aktif","","2026-09-01"],["KDR-0231","","Muhammad Mulya","Ikhwan","Cibadak","Cibadak","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0232","","Teguh","Ikhwan","Rangkasbitung","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0233","","Ahmad Daenuri","Ikhwan","Cibadak","Cibadak","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0234","","Akhmad E Firli D","Ikhwan","Cibadak","Cibadak","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0235","","Aang Farhan Alawi","Ikhwan","Rangkasbitung","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0236","","Riki Fathul Qolbi","Ikhwan","Serang","Serang","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0237","","Dadan","Ikhwan","Rangkasbitung","Rangkasbitung","","UPA-Ivan","Pratama","Aktif","","2026-09-01"],["KDR-0238","","Ilyas","Ikhwan","Kalanganyar","Kalanganyar","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0239","","Fajri Baha","Ikhwan","Cibadak","Cibadak","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0240","","Kusnadi (ajes)","Ikhwan","Cibadak","Cibadak","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0241","","Wafda","Ikhwan","Cibadak","Cibadak","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0242","","Sarya","Ikhwan","Cibadak","Cibadak","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0243","","Abdul Qodir","Ikhwan","Cipanas","Cipanas","","UPA-Ivan","Pratama","Aktif","","2026-09-01"],["KDR-0244","","Ahmad","Ikhwan","Cipanas","Cipanas","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0245","","Ajat","Ikhwan","Cipanas","Cipanas","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0246","","Nurfadilah","Akhwat","Cipanas","Cipanas","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0247","","Nunung","Akhwat","Cipanas","Cipanas","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0248","","Siti Farida","Akhwat","Cipanas","Cipanas","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0249","","Romdoni","Ikhwan","Curugbitung","Curugbitung","","UPA-Dedih","Pratama","Aktif","","2026-09-01"],["KDR-0250","","Apriansyah","Ikhwan","Curugbitung","Curugbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0251","","Oji","Ikhwan","Curugbitung","Curugbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0252","","Satri","Ikhwan","Curugbitung","Curugbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0253","","Erik heriana","Ikhwan","Warunggunung","Warunggunung","","UPA-Sanuji","Pratama","Aktif","","2026-09-01"],["KDR-0254","","Ferdi Saepulloh","Ikhwan","Sajira","Sajira","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0255","","H. Dulwira","Ikhwan","Cipanas","Cipanas","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0256","","Idi Suhaedi","Ikhwan","Sajira","Sajira","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0257","","M. Subandi","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0258","","Tajudin","Ikhwan","Bojongmanik","Bojongmanik","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0259","","Tamrin","Ikhwan","Warunggunung","Warunggunung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0260","","Ahmad Yani","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0261","","Dayat Hidayat","Ikhwan","Cilograng","Cilograng","","UPA-Iip","Pratama","Aktif","","2026-09-01"],["KDR-0262","","Ahmad thohirin","Ikhwan","Cilograng","Cilograng","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0263","","Apud saepudin","Ikhwan","Cilograng","Cilograng","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0264","","Syaiful Mochtar","Ikhwan","Cilograng","Cilograng","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0265","","Sarip Hidayat","Ikhwan","Cilograng","Cilograng","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0266","","Karjan","Ikhwan","Cilograng","Cilograng","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0267","","Apit. S","Ikhwan","Cilograng","Cilograng","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0268","","Adji Gusti Fauji","Ikhwan","Panggarangan","Panggarangan","","UPA-Jaenudin","Pratama","Aktif","","2026-09-01"],["KDR-0269","","Iwan Hermawan","Ikhwan","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0270","","Thomas Ramadhan","Ikhwan","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0271","","Adi Nursyahbani","Ikhwan","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0272","","M. Syarifuddin H.T","Ikhwan","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0273","","Suwarno","Ikhwan","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0274","","Apen Supendi","Ikhwan","Panggarangan","Panggarangan","","UPA-Ramdani","Pratama","Aktif","","2026-09-01"],["KDR-0275","","Isep Suryana","Ikhwan","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0276","","Bubun Mulyani","Ikhwan","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0277","","Alwanto","Ikhwan","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0278","","Hasan Albana","Ikhwan","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0279","","Suryana","Ikhwan","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0280","","Eza","Ikhwan","Panggarangan","Panggarangan","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0281","","Alija Pranawa","Ikhwan","","Rangkasbitung","","UPA-Apriyadi","Pratama","Aktif","","2026-09-01"],["KDR-0282","","Dwi Ridwan","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0283","","Anshori","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0284","","Syahdan Maulana","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0285","","Fajar","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0286","","Suma","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0287","","Marwan","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0288","","Dedeh Mustari","Akhwat","Cibadak","Cibadak","","UPA-Nairoh","Pratama","Aktif","","2026-09-01"],["KDR-0289","","Efra Dewi","Akhwat","Cibadak","Cibadak","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0290","","Risky Dwi Amalia","Akhwat","Rangkasbitung","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0291","","Laily Wahyuningsih","Akhwat","Rangkasbitung","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0292","","Hodijah","Akhwat","Curugbitung","Curugbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0293","","Amira","Akhwat","Kalanganyar","Kalanganyar","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0294","","Fika Nafisat","Akhwat","Kalanganyar","Kalanganyar","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0295","","Vitie","Akhwat","Cibadak","Cibadak","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0296","","Mustika sari","Akhwat","Kalanganyar","Kalanganyar","","UPA-Nurhayati","Pratama","Aktif","","2026-09-01"],["KDR-0297","","Heriyah","Akhwat","Kalanganyar","Kalanganyar","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0298","","Triana","Akhwat","Kalanganyar","Kalanganyar","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0299","","Niki Tutwuri","Akhwat","Kalanganyar","Kalanganyar","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0300","","Siti Nur Anisah","Akhwat","Cibadak","Cibadak","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0301","","Bella Damayanti","Akhwat","Rangkasbitung","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0302","","Siti Nurul Falah","Akhwat","Warunggunung","Warunggunung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0303","","Siti Rahmah Mulyani","Akhwat","Rangkasbitung","Rangkasbitung","","UPA-Umi","Pratama","Aktif","","2026-09-01"],["KDR-0304","","Amelia Rahma PY","Akhwat","Rangkasbitung","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0305","","Sifa Nadiah","Akhwat","Rangkasbitung","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0306","","Fadilah Hafit Nur","Akhwat","Rangkasbitung","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0307","","Dita Septiani","Akhwat","Rangkasbitung","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0308","","Siti Nur Awal Bulqiah","Akhwat","Rangkasbitung","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0309","","Siti Sarah Subani","Akhwat","Rangkasbitung","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0310","","Iis","Akhwat","Kalanganyar","Kalanganyar","","UPA-Desi","Pratama","Aktif","","2026-09-01"],["KDR-0311","","Iyah","Akhwat","Kalanganyar","Kalanganyar","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0312","","Maryati","Akhwat","Kalanganyar","Kalanganyar","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0313","","Unaeni","Akhwat","Kalanganyar","Kalanganyar","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0314","","Nuriyah","Akhwat","Kalanganyar","Kalanganyar","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0315","","Rostini","Akhwat","Rangkasbitung","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0316","","Lilis","Akhwat","Kalanganyar","Kalanganyar","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0317","","Rina Ariani","Akhwat","Cibadak","Cibadak","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0318","","Nur Ana Maria","Akhwat","Cibadak","Cibadak","","UPA-Siti","Pratama","Aktif","","2026-09-01"],["KDR-0319","","Siti Baihatu Nupus","Akhwat","Cibadak","Cibadak","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0320","","Siti Rohbiyah","Akhwat","Warunggunung","Warunggunung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0321","","Titin Agustini","Akhwat","Cibadak","Cibadak","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0322","","Iyus","Akhwat","Kalanganyar","Kalanganyar","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0323","","Deti","Akhwat","Kalanganyar","Kalanganyar","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0324","","Helmi","Akhwat","Kalanganyar","Kalanganyar","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0325","","Mulyani","Akhwat","Cibadak","Cibadak","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0326","","Tria Pihapsari","Akhwat","Cibadak","Cibadak","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0327","","Eneng","Akhwat","Rangkasbitung","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0328","","Trini Megasari","Akhwat","Maja","Maja","","UPA-Novitasari","Pratama","Aktif","","2026-09-01"],["KDR-0329","","Karina Ramadhanti","Akhwat","Maja","Maja","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0330","","Silvia","Akhwat","Maja","Maja","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0331","","Laelasari","Akhwat","Maja","Maja","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0332","","Umu Kultsum","Akhwat","Maja","Maja","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0333","","Hamsah","Akhwat","Maja","Maja","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0334","","Mulyanah","Akhwat","Maja","Maja","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0335","","Mimin","Akhwat","Maja","Maja","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0336","","Siti Atiyah","Akhwat","Rangkasbitung","Rangkasbitung","","UPA-Tuti","Pratama","Aktif","","2026-09-01"],["KDR-0337","","Yopi Purnamasari","Akhwat","Rangkasbitung","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0338","","Patimah","Akhwat","Cimarga","Cimarga","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0339","","Neng Daviussaiat","Akhwat","Serang","Serang","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0340","","Siti Alpiah","Akhwat","Rangkasbitung","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0341","","Sri Adawiyah","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0342","","Nurhayati","Akhwat","Cibadak","Cibadak","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0343","","Lilis Suryani","Akhwat","Leuwidamar","Leuwidamar","","UPA-Kartinah","Pratama","Aktif","","2026-09-01"],["KDR-0344","","Hj. Emah","Akhwat","Leuwidamar","Leuwidamar","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0345","","Friyal Putri Syahidah","Akhwat","Maja","Maja","","UPA-Leni","Pratama","Aktif","","2026-09-01"],["KDR-0346","","Diana Papilaya","Akhwat","Panggarangan","Panggarangan","","UPA-Neneng","Pratama","Aktif","","2026-09-01"],["KDR-0347","","Feni Febriyanti","Akhwat","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0348","","Ima Nurmaningsih","Akhwat","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0349","","Fatimah Endinasari","Akhwat","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0350","","Dedeh","Akhwat","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0351","","Mimin","Akhwat","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0352","","Sumsiah","Akhwat","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0353","","Cucum Sumyati","Akhwat","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0354","","Hodiah","Akhwat","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0355","","Erni","Akhwat","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0356","","Iyo Yanuar","Akhwat","Panggarangan","Panggarangan","","UPA-Neneng","Pratama","Aktif","","2026-09-01"],["KDR-0357","","Meli Aulia","Akhwat","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0358","","Eni Hotini","Akhwat","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0359","","Eni Maryani","Akhwat","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0360","","Enong Murtapiah","Akhwat","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0361","","Jumhati","Akhwat","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0362","","Astri","Akhwat","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0363","","Siti Homsah","Akhwat","Panggarangan","Panggarangan","","UPA-Hindun","Pratama","Aktif","","2026-09-01"],["KDR-0364","","Nani Ika Nurmayani","Akhwat","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0365","","Apriyani Rahayu","Akhwat","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0366","","Tati","Akhwat","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0367","","Jamilah","Akhwat","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0368","","Mira","Akhwat","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0369","","Watini","Akhwat","Panggarangan","Panggarangan","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0370","","Aini","Akhwat","Bayah","Bayah","","UPA-Reka","Pratama","Aktif","","2026-09-01"],["KDR-0371","","Ainun","Akhwat","Bayah","Bayah","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0372","","Hutiyah","Akhwat","Bayah","Bayah","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0373","","Aminah","Akhwat","Bayah","Bayah","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0374","","Cici","Akhwat","Bayah","Bayah","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0375","","Elma","Akhwat","Bayah","Bayah","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0376","","Tiah","Akhwat","Bayah","Bayah","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0377","","Iis Khairiyah","Akhwat","Bayah","Bayah","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0378","","Junita Sari","Akhwat","Bayah","Bayah","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0379","","Nia","Akhwat","Bayah","Bayah","","UPA-Melly","Pratama","Aktif","","2026-09-01"],["KDR-0380","","Lisda","Akhwat","Bayah","Bayah","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0381","","Ulfa","Akhwat","Bayah","Bayah","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0382","","Uyun","Akhwat","Bayah","Bayah","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0383","","Helma","Akhwat","Bayah","Bayah","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0384","","Nesa","Akhwat","Bayah","Bayah","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0385","","Sawiah","Akhwat","Cibeber","Cibeber","","UPA-Siska","Pratama","Aktif","","2026-09-01"],["KDR-0386","","Sulisfia Fitriyani","Akhwat","Cibeber","Cibeber","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0387","","Herlina Permatasari","Akhwat","Cibeber","Cibeber","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0388","","Yesi Damayanti","Akhwat","Cibeber","Cibeber","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0389","","Siti Mulyani","Akhwat","Cibeber","Cibeber","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0390","","Yuyu Yuhesih","Akhwat","Cibeber","Cibeber","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0391","","Etin Yuliawati","Akhwat","Cibeber","Cibeber","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0392","","Miranti","Akhwat","Cibeber","Cibeber","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0393","","Nurkholipah","Akhwat","Cibeber","Cibeber","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0394","","Indri Nurmalasari","Akhwat","Cibeber","Cibeber","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0395","","Maryati","Akhwat","Cilograng","Cilograng","","UPA-Imas","Pratama","Aktif","","2026-09-01"],["KDR-0396","","Ulpah","Akhwat","Cilograng","Cilograng","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0397","","Ernawati","Akhwat","Cilograng","Cilograng","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0398","","Ening","Akhwat","Cilograng","Cilograng","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0399","","Susi","Akhwat","Cilograng","Cilograng","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0400","","Oom","Akhwat","Cilograng","Cilograng","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0401","","Cicin","Akhwat","Cilograng","Cilograng","","Belum Ditentukan","Pratama","Aktif","","2026-09-01"],["KDR-0402","","26 UPA Pratama","Ikhwan","","Rangkasbitung","","JUMLAH","Pratama","Aktif","","2026-09-01"],["KDR-0403","","178 Anggota Pratama","Ikhwan","","Rangkasbitung","","UPA-Jumlah","Pratama","Aktif","","2026-09-01"],["KDR-0404","","Owen","Ikhwan","","Rangkasbitung","","UPA-Mukmin","Muda","Aktif","","2026-09-01"],["KDR-0405","","Maulana Mochamad Raihan","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0406","","Badri","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0407","","M. Rendika (Dion)","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0408","","Adi Permana","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0409","","Arjuna Galih Saputra","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0410","","Subihat","Ikhwan","","Cibadak","","UPA-Bustomi","Muda","Aktif","","2026-09-01"],["KDR-0411","","Andhi Sunardi Mahmukin","Ikhwan","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0412","","Uci Sanusi","Ikhwan","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0413","","Iing Solihin","Ikhwan","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0414","","Ahmad  Supandi","Ikhwan","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0415","","Moh. Anas","Ikhwan","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0416","","Nanang Damanhuri","Ikhwan","","Rangkasbitung","","UPA-M","Muda","Aktif","","2026-09-01"],["KDR-0417","","Acep","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0418","","Rizal (Adiknnya Bu Nani)","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0419","","Suhendar","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0420","","Amin","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0421","","Ujer","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0422","","Agung Fitrayana","Ikhwan","","Rangkasbitung","","UPA-Paryanto","Muda","Aktif","","2026-09-01"],["KDR-0423","","Apip Sopandi","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0424","","Dede Sapta Raharja","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0425","","Rukman","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0426","","Niki Ardiansyah Dwi Putra","Ikhwan","","Kalanganyar","","UPA-Yayat","Muda","Aktif","","2026-09-01"],["KDR-0427","","Rifki Suryana","Ikhwan","","Kalanganyar","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0428","","Supriyadi","Ikhwan","","Kalanganyar","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0429","","Arrizal Fiqi","Ikhwan","","Kalanganyar","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0430","","Majum","Ikhwan","","Gunung Kencana","","UPA-Mistar","Muda","Aktif","","2026-09-01"],["KDR-0431","","Dadan Nurjaman","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0432","","Herman","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0433","","Ahmad Sudira","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0434","","Budi Irawan","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0435","","Mohamad Nazri","Ikhwan","","Gunung Kencana","","UPA-Mistar","Muda","Aktif","","2026-09-01"],["KDR-0436","","Muhamad Jeri","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0437","","Dadan Supriadi","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0438","","M. Sutarji","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0439","","Azi Efendi","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0440","","H. Kastri","Ikhwan","","Gunung Kencana","","UPA-Mistar","Muda","Aktif","","2026-09-01"],["KDR-0441","","Ali","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0442","","Surya Maulana","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0443","","Samarudin","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0444","","Febi Rianto","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0445","","Didih","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0446","","Sumitra","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0447","","Jumatra","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0448","","Lilis Suryani","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0449","","Irma Damayanti","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0450","","Asri","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0451","","Toyo","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0452","","H. Mahbub","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0453","","H. Iwan","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0454","","Rudy","Ikhwan","","Sajira","","UPA-Eli","Muda","Aktif","","2026-09-01"],["KDR-0455","","Hermansyah","Ikhwan","","Sajira","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0456","","Yahya yudin","Ikhwan","","Sajira","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0457","","Hakim","Ikhwan","","Sajira","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0458","","Madrudin","Ikhwan","","Sajira","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0459","","Linda","Akhwat","","Sajira","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0460","","Anwarudin","Ikhwan","","Malingping","","UPA-Ali","Muda","Aktif","","2026-09-01"],["KDR-0461","","Randi Permana","Ikhwan","","Malingping","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0462","","Rama","Ikhwan","","Malingping","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0463","","Rumani","Ikhwan","","Malingping","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0464","","Najjib Fahmi","Ikhwan","","Malingping","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0465","","Osep Mahmudi","Ikhwan","","Malingping","","UPA-Agus","Muda","Aktif","","2026-09-01"],["KDR-0466","","Saeful","Ikhwan","","Malingping","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0467","","Ade","Ikhwan","","Malingping","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0468","","Supardi","Ikhwan","","Malingping","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0469","","Junaedi","Ikhwan","","Malingping","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0470","","Sanim","Ikhwan","","Malingping","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0471","","Jahda","Ikhwan","","Malingping","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0472","","Wawan","Ikhwan","","Malingping","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0473","","Agus setawan","Ikhwan","","Malingping","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0474","","Uceh","Ikhwan","","Malingping","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0475","","Arniah","Akhwat","","Rangkasbitung","","UPA-Tantri","Muda","Aktif","","2026-09-01"],["KDR-0476","","Neng Nurjanah","Akhwat","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0477","","Prapti Kusumarini","Akhwat","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0478","","Mufida","Akhwat","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0479","","Astri Wulandari","Akhwat","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0480","","Juwita","Akhwat","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0481","","Restu","Akhwat","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0482","","Realya","Akhwat","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0483","","Een Nuraeni","Akhwat","","Cibadak","","UPA-Novitasari","Muda","Aktif","","2026-09-01"],["KDR-0484","","Siti Mulyanah","Akhwat","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0485","","Mia Zamzami","Akhwat","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0486","","Mida","Akhwat","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0487","","Rosdyana","Akhwat","","Cibadak","","UPA-Kartinah","Muda","Aktif","","2026-09-01"],["KDR-0488","","Tita Rosita","Akhwat","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0489","","Tina Astiawati","Akhwat","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0490","","Rika","Akhwat","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0491","","Enong","Akhwat","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0492","","Erna","Akhwat","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0493","","Sanaah","Akhwat","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0494","","Yati","Akhwat","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0495","","Evi Alviah","Akhwat","","Cibadak","","UPA-Mamah","Muda","Aktif","","2026-09-01"],["KDR-0496","","Mutiara","Akhwat","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0497","","Ocenia","Akhwat","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0498","","Fitri SMP","Akhwat","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0499","","Rosita","Akhwat","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0500","","Ila","Akhwat","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0501","","Yuliana","Akhwat","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0502","","Mita","Akhwat","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0503","","Nur Fitriyani","Akhwat","","Kalanganyar","","UPA-Erlin","Muda","Aktif","","2026-09-01"],["KDR-0504","","Novianti","Akhwat","","Kalanganyar","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0505","","Ratu Nita Dwi","Akhwat","","Kalanganyar","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0506","","Wulan","Akhwat","","Kalanganyar","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0507","","Nadin Adiwinata","Akhwat","","Kalanganyar","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0508","","Risti","Akhwat","","Kalanganyar","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0509","","Indri","Akhwat","","Kalanganyar","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0510","","Upi Marlini","Akhwat","","Rangkasbitung","","UPA-Nova","Muda","Aktif","","2026-09-01"],["KDR-0511","","Anggi Mentari","Akhwat","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0512","","Wiwin","Akhwat","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0513","","Ani Utami","Akhwat","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0514","","Iyus Apriyanti","Akhwat","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0515","","Kusuma Winda","Akhwat","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0516","","Iin","Akhwat","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0517","","Ica","Akhwat","","Rangkasbitung","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0518","","Lilis Nurjanah","Akhwat","","Cibadak","","UPA-Leni","Muda","Aktif","","2026-09-01"],["KDR-0519","","Siti Komariah","Akhwat","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0520","","Dewi Indrayani","Akhwat","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0521","","Neneng Hasanah","Akhwat","","Cibadak","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0522","","Sri Astuti Febriyani","Akhwat","","Cibeber","","UPA-Ice","Muda","Aktif","","2026-09-01"],["KDR-0523","","Aas Nisyanti","Akhwat","","Cibeber","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0524","","Fakhira S Iskandar","Akhwat","","Cibeber","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0525","","Puput (Annida Azhar Putri)","Akhwat","","Cibeber","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0526","","Vidya Iswari","Akhwat","","Cibeber","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0527","","Yayah","Akhwat","","Cibeber","","Belum Ditentukan","Muda","Aktif","","2026-09-01"],["KDR-0528","","19 UPA Muda","Ikhwan","","Rangkasbitung","","JUMLAH","Muda","Aktif","","2026-09-01"],["KDR-0529","","124 Anggota Muda","Ikhwan","","Rangkasbitung","","UPA-Jumlah","Muda","Aktif","","2026-09-01"],["KDR-0530","","Andi Setiawan","Ikhwan","","Warunggunung","","UPA-Yayat","Pemula","Aktif","","2026-09-01"],["KDR-0531","","Iman Budiman","Ikhwan","","Warunggunung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0532","","Adeng","Ikhwan","","Warunggunung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0533","","Karyono","Ikhwan","","Warunggunung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0534","","Ajat Sudrajat","Ikhwan","","Warunggunung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0535","","Muhamad erus","Ikhwan","","Warunggunung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0536","","Mahruni","Ikhwan","","Warunggunung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0537","","Warno","Ikhwan","","Warunggunung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0538","","Rifky Rachman","Ikhwan","","Warunggunung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0539","","Saban","Ikhwan","","Warunggunung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0540","","Sukmara","Ikhwan","","Warunggunung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0541","","Al Kahfi asfihany","Ikhwan","","Warunggunung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0542","","Aon","Ikhwan","","Warunggunung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0543","","Masrudin","Ikhwan","","Warunggunung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0544","","Mahrun","Ikhwan","","Warunggunung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0545","","Muhidin","Ikhwan","","Rangkasbitung","","UPA-Paryanto","Pemula","Aktif","","2026-09-01"],["KDR-0546","","Sabit","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0547","","Yaya Sunarya","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0548","","Mu'min Heryadi","Ikhwan","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0549","","Hj. Wawat","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0550","","Ahmad Saepudin","Ikhwan","","Curugbitung","","UPA-Dedih","Pemula","Aktif","","2026-09-01"],["KDR-0551","","Sudarman","Ikhwan","","Curugbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0552","","Dede Suryana","Ikhwan","","Curugbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0553","","Yudistira","Ikhwan","","Curugbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0554","","Subandi","Ikhwan","","Curugbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0555","","Irus","Ikhwan","","Curugbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0556","","Jaludin","Ikhwan","","Curugbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0557","","Roni","Ikhwan","","Curugbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0558","","Wawan","Ikhwan","","Curugbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0559","","Samu","Ikhwan","","Maja","","UPA-Eko","Pemula","Aktif","","2026-09-01"],["KDR-0560","","Kholil","Ikhwan","","Maja","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0561","","Awing","Ikhwan","","Maja","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0562","","Abay","Ikhwan","","Maja","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0563","","Idrus","Ikhwan","","Maja","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0564","","Rustam","Ikhwan","","Maja","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0565","","H. Aat","Ikhwan","","Maja","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0566","","Ahmad Fatoni","Ikhwan","","Cirinten","","UPA-Baedowi","Pemula","Aktif","","2026-09-01"],["KDR-0567","","Imat Rahmat","Ikhwan","","Cirinten","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0568","","Joni","Ikhwan","","Cirinten","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0569","","Badrusalam","Ikhwan","","Cirinten","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0570","","Idris","Ikhwan","","Cirinten","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0571","","H.Rohadi","Ikhwan","","Cirinten","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0572","","Jahra","Ikhwan","","Cirinten","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0573","","Suryana","Ikhwan","","Cirinten","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0574","","Abidin","Ikhwan","","Cirinten","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0575","","Sadim","Ikhwan","","Cirinten","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0576","","H.Muktaf","Ikhwan","","Cirinten","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0577","","Heri","Ikhwan","","Cirinten","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0578","","Sachowi","Ikhwan","","Cirinten","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0579","","Dayat","Ikhwan","","Cirinten","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0580","","Sahani","Ikhwan","","Cirinten","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0581","","Saridi","Ikhwan","","Cirinten","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0582","","Toyo","Ikhwan","","Gunung Kencana","","UPA-Yayan","Pemula","Aktif","","2026-09-01"],["KDR-0583","","Febi","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0584","","Ali","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0585","","Samarudin","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0586","","Sabit","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0587","","H. Mahbub","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0588","","Rodin","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0589","","Suhayah","Ikhwan","","Gunung Kencana","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0590","","Yunengsih","Akhwat","","Gunung Kencana","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0591","","Rahmat","Ikhwan","","Cibeber","","UPA-Juhedi","Pemula","Aktif","","2026-09-01"],["KDR-0592","","Tarman","Ikhwan","","Cibeber","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0593","","Suhedi","Ikhwan","","Cibeber","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0594","","Hilman H","Ikhwan","","Cibeber","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0595","","Deni","Ikhwan","","Cijaku","","UPA-Sudin","Pemula","Aktif","","2026-09-01"],["KDR-0596","","Agri","Ikhwan","","Cijaku","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0597","","Arif","Ikhwan","","Cijaku","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0598","","Agus sutiyawan","Ikhwan","","Wanasalam","","UPA-Heriyanto","Pemula","Aktif","","2026-09-01"],["KDR-0599","","Asep Sholih","Ikhwan","","Wanasalam","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0600","","Amarulloh Fathoni","Ikhwan","","Wanasalam","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0601","","Kalipan","Ikhwan","","Wanasalam","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0602","","Faiz El jihad","Ikhwan","","Wanasalam","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0603","","Bashor","Ikhwan","","Wanasalam","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0604","","Dadan","Ikhwan","","Wanasalam","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0605","","Sirojudin","Ikhwan","","Wanasalam","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0606","","Adar Sukandar","Ikhwan","","Bayah","","UPA-Sanuji","Pemula","Aktif","","2026-09-01"],["KDR-0607","","Arjum Khan","Ikhwan","","Bayah","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0608","","Apen","Ikhwan","","Bayah","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0609","","Dede Asep Sunandar","Ikhwan","","Bayah","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0610","","Maulana Abdul Kirom","Ikhwan","","Bayah","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0611","","Usep Nursidik","Ikhwan","","Bayah","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0612","","Yogi","Ikhwan","","Cibadak","","UPA-Didin","Pemula","Aktif","","2026-09-01"],["KDR-0613","","Amin","Ikhwan","","Cibadak","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0614","","Ade Supriyadi","Ikhwan","","Cibadak","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0615","","Latif","Ikhwan","","Cibadak","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0616","","Deni","Ikhwan","","Cibadak","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0617","","E'eng","Ikhwan","","Cibadak","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0618","","Iip","Ikhwan","","Cibadak","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0619","","Yanto","Ikhwan","","Cibadak","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0620","","Jayadi","Ikhwan","","Cibadak","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0621","","Muhamad Junaedi","Ikhwan","","Bojongmanik","","UPA-H","Pemula","Aktif","","2026-09-01"],["KDR-0622","","Sardi, SE","Ikhwan","","Bojongmanik","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0623","","Tajudin","Ikhwan","","Bojongmanik","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0624","","Ustdz Andi","Ikhwan","","Bojongmanik","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0625","","Usman","Ikhwan","","Bojongmanik","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0626","","Kusna","Ikhwan","","Bojongmanik","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0627","","H. Indra","Ikhwan","","Bojongmanik","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0628","","Suparman, S.Sos","Ikhwan","","Bojongmanik","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0629","","Murotib","Ikhwan","","Bojongmanik","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0630","","Mamah","Ikhwan","","Bojongmanik","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0631","","Juhdi","Ikhwan","","Bojongmanik","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0632","","Miptajudin","Ikhwan","","Bojongmanik","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0633","","Nana Sukarna","Ikhwan","","Cibeber","","UPA-Jajat","Pemula","Aktif","","2026-09-01"],["KDR-0634","","Yukarma","Ikhwan","","Cibeber","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0635","","Yuhadin","Ikhwan","","Cibeber","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0636","","Nano Kurniawan","Ikhwan","","Cibeber","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0637","","Juarna","Ikhwan","","Cibeber","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0638","","Rusdiana","Ikhwan","","Cibeber","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0639","","Suharya","Ikhwan","","Cibeber","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0640","","Sukaria","Ikhwan","","Cibeber","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0641","","Sudrajat","Ikhwan","","Cibeber","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0642","","Sarhama","Ikhwan","","Cibeber","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0643","","Yuhara","Ikhwan","","Cibeber","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0644","","Ust. Wardi","Ikhwan","","Cibeber","","UPA-Jajat","Pemula","Aktif","","2026-09-01"],["KDR-0645","","Suherman","Ikhwan","","Cibeber","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0646","","Diki","Ikhwan","","Cibeber","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0647","","Edo","Ikhwan","","Cibeber","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0648","","Sugeng","Ikhwan","","Leuwidamar","","UPA-Didin","Pemula","Aktif","","2026-09-01"],["KDR-0649","","Diding","Ikhwan","","Leuwidamar","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0650","","H. Ismail","Ikhwan","","Leuwidamar","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0651","","Bili","Ikhwan","","Leuwidamar","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0652","","Suheli","Ikhwan","","Leuwidamar","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0653","","Lilis Suryani","Akhwat","","Leuwidamar","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0654","","Siti Hasanah","Akhwat","","Leuwidamar","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0655","","Hj. Emah","Akhwat","","Leuwidamar","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0656","","Nina","Akhwat","","Rangkasbitung","","UPA-Poni","Pemula","Aktif","","2026-09-01"],["KDR-0657","","Endah","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0658","","Mutia","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0659","","Rafikah","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0660","","Yati","Akhwat","","Leuwidamar","","UPA-Kartinah","Pemula","Aktif","","2026-09-01"],["KDR-0661","","Yuyun","Akhwat","","Leuwidamar","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0662","","Ade marliyah","Akhwat","","Leuwidamar","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0663","","Hj. Irma","Akhwat","","Leuwidamar","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0664","","Omah Hartati","Akhwat","","Leuwidamar","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0665","","Ciah Komala sari","Akhwat","","Leuwidamar","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0666","","Reny Suryani","Akhwat","","Leuwidamar","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0667","","Hindun","Akhwat","","Leuwidamar","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0668","","Eha Maharani","Akhwat","","Leuwidamar","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0669","","Jujun","Akhwat","","Leuwidamar","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0670","","Titin","Akhwat","","Leuwidamar","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0671","","Dewi","Akhwat","","Leuwidamar","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0672","","Rizki","Akhwat","","Leuwidamar","","UPA-Kartinah","Pemula","Aktif","","2026-09-01"],["KDR-0673","","Hidayah","Akhwat","","Leuwidamar","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0674","","Maemunah","Akhwat","","Leuwidamar","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0675","","Uni","Akhwat","","Leuwidamar","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0676","","Sinah","Akhwat","","Leuwidamar","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0677","","Hj. Tini","Akhwat","","Rangkasbitung","","UPA-Kartinah","Pemula","Aktif","","2026-09-01"],["KDR-0678","","Iis","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0679","","Lina","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0680","","Rina","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0681","","Dewi","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0682","","Nurul ulya","Akhwat","","Rangkasbitung","","UPA-Ade","Pemula","Aktif","","2026-09-01"],["KDR-0683","","Febriyani","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0684","","Hayatun nisa","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0685","","Hilma Yatina sari","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0686","","Ummi Munawwaroh","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0687","","Ayatul husna","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0688","","Mardiyah","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0689","","Dahliah","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0690","","Nafilah","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0691","","Nurngaeni","Akhwat","","Rangkasbitung","","UPA-Ade","Pemula","Aktif","","2026-09-01"],["KDR-0692","","Hj. Engkoy","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0693","","Hj. Eti","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0694","","Rospinalis","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0695","","Eva Nurhasnah","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0696","","Juhana","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0697","","Sudarmi","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0698","","Tari","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0699","","Hj.Yiyin","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0700","","Eneng","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0701","","Hj.Irawati","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0702","","Dedo Susiawati","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0703","","Hj.Euis Nuraeni","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0704","","Hj. Imas","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0705","","Titi","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0706","","Bunda alea","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0707","","Hj. Mimih","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0708","","Lela Andriyana","Akhwat","","Rangkasbitung","","UPA-Siti","Pemula","Aktif","","2026-09-01"],["KDR-0709","","Nining Mulyanah","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0710","","Herda","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0711","","Ucu","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0712","","Ummi Danil","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0713","","Yufhi","Akhwat","","Rangkasbitung","","UPA-Siti","Pemula","Aktif","","2026-09-01"],["KDR-0714","","Widia","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0715","","Shara","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0716","","Nining","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0717","","Wati","Akhwat","","Rangkasbitung","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0718","","Maesaroh","Akhwat","","Wanasalam","","UPA-Bayi","Pemula","Aktif","","2026-09-01"],["KDR-0719","","Resti","Akhwat","","Wanasalam","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0720","","Adah Salamah","Akhwat","","Wanasalam","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0721","","Sulistiyani","Akhwat","","Wanasalam","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0722","","Maisya","Akhwat","","Wanasalam","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0723","","Nurhasanah","Akhwat","","Wanasalam","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0724","","Zakiah","Akhwat","","Wanasalam","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0725","","Edah","Akhwat","","Wanasalam","","UPA-Bayi","Pemula","Aktif","","2026-09-01"],["KDR-0726","","Yuyun Yuningsih","Akhwat","","Wanasalam","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0727","","Komariah","Akhwat","","Wanasalam","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0728","","Juju","Akhwat","","Panggarangan","","UPA-Eneng","Pemula","Aktif","","2026-09-01"],["KDR-0729","","Elis","Akhwat","","Panggarangan","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0730","","Romlah","Akhwat","","Panggarangan","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0731","","Juanah","Akhwat","","Panggarangan","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0732","","Elis","Akhwat","","Bayah","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0733","","Muryanah","Akhwat","","Bayah","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0734","","Enok","Akhwat","","Bayah","","UPA-Esri","Pemula","Aktif","","2026-09-01"],["KDR-0735","","Novi","Akhwat","","Bayah","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0736","","Ina","Akhwat","","Bayah","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0737","","Ika","Akhwat","","Bayah","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0738","","Devi","Akhwat","","Bayah","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0739","","Lina Marlina","Akhwat","","Bayah","","UPA-Esri","Pemula","Aktif","","2026-09-01"],["KDR-0740","","Fadhilah","Akhwat","","Bayah","","UPA-Neneng","Pemula","Aktif","","2026-09-01"],["KDR-0741","","Paulina","Akhwat","","Bayah","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0742","","Herni","Akhwat","","Bayah","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0743","","Dewi rahayu","Akhwat","","Bayah","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0744","","Uum","Akhwat","","Bayah","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0745","","Sumiyati","Akhwat","","Bayah","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0746","","Sari","Akhwat","","Bayah","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0747","","Maria","Akhwat","","Bayah","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0748","","Liem","Akhwat","","Bayah","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0749","","Rima","Akhwat","","Bayah","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0750","","Dede","Akhwat","","Bayah","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0751","","Sri nurbaiti","Akhwat","","Bayah","","UPA-Sri","Pemula","Aktif","","2026-09-01"],["KDR-0752","","Neni aprianingsih","Akhwat","","Bayah","","UPA-Sriyantini","Pemula","Aktif","","2026-09-01"],["KDR-0753","","Hayya","Akhwat","","Cilograng","","UPA-Imas","Pemula","Aktif","","2026-09-01"],["KDR-0754","","Zahra","Akhwat","","Cilograng","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0755","","Iqoh","Akhwat","","Cilograng","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0756","","Ratih","Akhwat","","Cilograng","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0757","","Elis","Akhwat","","Cilograng","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0758","","Yuyu","Akhwat","","Cilograng","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0759","","Rani","Akhwat","","Cilograng","","Belum Ditentukan","Pemula","Aktif","","2026-09-01"],["KDR-0760","","32 UPA Pemula","Ikhwan","","Rangkasbitung","","JUMLAH","Pemula","Aktif","","2026-09-01"],["KDR-0761","","230 Anggota Pemula","Ikhwan","","Rangkasbitung","","UPA-Jumlah","Pemula","Aktif","","2026-09-01"]];
}

function getMasterUpaSeedRows() {
  return [["3602D005","UPA A'la","A'la Rotbi","Dewasa","Ahad, 06.00 WIB","Rangkasbitung","Ikhwan","2026-09-01"],["3602D002","UPA 3602D002","Belum Ditentukan","Dewasa","Ahad, 06.00 WIB","Rangkasbitung","Ikhwan","2026-09-01"],["3602D004","UPA 3602D004","Belum Ditentukan","Dewasa","Ahad, 06.00 WIB","Rangkasbitung","Akhwat","2026-09-01"],["3602D001","UPA A'la","A'la Rotbi","Dewasa","Ahad, 06.00 WIB","Cibadak","Ikhwan","2026-09-01"],["3602D003","UPA Iwan","Iwan Supriana","Dewasa","Ahad, 06.00 WIB","Cibadak","Ikhwan","2026-09-01"],["3602D007","UPA Eva","Eva Muzdalifah","Dewasa","Ahad, 06.00 WIB","Rangkasbitung","Akhwat","2026-09-01"],["3602D006","UPA Nani","Nani Suryani","Dewasa","Ahad, 06.00 WIB","Cibadak","Akhwat","2026-09-01"],["3602D009","UPA Siti","Siti Faridah","Dewasa","Ahad, 06.00 WIB","Kalanganyar","Akhwat","2026-09-01"],["3602D0010","UPA Siti","Siti Maryam","Dewasa","Ahad, 06.00 WIB","Kalanganyar","Akhwat","2026-09-01"],["3602D008","UPA Neneng","Neneng Atikah","Dewasa","Ahad, 06.00 WIB","Panggarangan","Akhwat","2026-09-01"],["UPA-Lili","UPA Lili","Lili Sugiyanto","Madya","Ahad, 06.00 WIB","Cibadak","Ikhwan","2026-09-01"],["UPA-Choirul","UPA Choirul","Choirul Amin","Madya","Ahad, 06.00 WIB","Cibadak","Ikhwan","2026-09-01"],["UPA-Aos","UPA Aos","Aos Mutaqin","Madya","Ahad, 06.00 WIB","Cibadak","Ikhwan","2026-09-01"],["UPA-Ahmad","UPA Ahmad","Ahmad Basuni","Madya","Ahad, 06.00 WIB","Kalanganyar","Ikhwan","2026-09-01"],["UPA-Samson","UPA Samson","Samson Rahman","Madya","Ahad, 06.00 WIB","Rangkasbitung","Ikhwan","2026-09-01"],["UPA-Apriyadi","UPA Apriyadi","Apriyadi","Madya","Ahad, 06.00 WIB","Rangkasbitung","Ikhwan","2026-09-01"],["UPA-Imron","UPA Imron","Imron Iskandar","Madya","Ahad, 06.00 WIB","Rangkasbitung","Ikhwan","2026-09-01"],["UPA-Suhabudin","UPA Suhabudin","Suhabudin","Madya","Ahad, 06.00 WIB","Panggarangan","Ikhwan","2026-09-01"],["UPA-Jajat","UPA Jajat","Jajat Sujarto","Madya","Ahad, 06.00 WIB","Bayah","Ikhwan","2026-09-01"],["UPA-Iip","UPA Iip","Iip Makmur","Madya","Ahad, 06.00 WIB","Cilograng","Ikhwan","2026-09-01"],["UPA-Erlin","UPA Erlin","Erlin Tristanti","Madya","Ahad, 06.00 WIB","Cibadak","Akhwat","2026-09-01"],["UPA-Leni","UPA Leni","Leni Mardiana","Madya","Ahad, 06.00 WIB","Cibadak","Akhwat","2026-09-01"],["UPA-Desi","UPA Desi","Desi Hermayanti","Madya","Ahad, 06.00 WIB","Cibadak","Akhwat","2026-09-01"],["3602M019","UPA Siti","Siti Maryam","Madya","Ahad, 06.00 WIB","Kalanganyar","Akhwat","2026-09-01"],["UPA-Nova","UPA Nova","Nova Diasari","Madya","Ahad, 06.00 WIB","Kalanganyar","Akhwat","2026-09-01"],["UPA-Ade","UPA Ade","Ade Jumsiah","Madya","Ahad, 06.00 WIB","Rangkasbitung","Akhwat","2026-09-01"],["UPA-Siti","UPA Siti","Siti Hadijah","Madya","Ahad, 06.00 WIB","Rangkasbitung","Akhwat","2026-09-01"],["UPA-Izmi","UPA Izmi","Izmi Izzatush Sholihah","Madya","Ahad, 06.00 WIB","Rangkasbitung","Akhwat","2026-09-01"],["UPA-Isni","UPA Isni","Isni Wardhani","Madya","Ahad, 06.00 WIB","Rangkasbitung","Akhwat","2026-09-01"],["UPA-Hera","UPA Hera","Hera Susanti","Madya","Ahad, 06.00 WIB","Warunggunung","Akhwat","2026-09-01"],["UPA-Neneng","UPA Neneng","Neneng Atikah","Madya","Ahad, 06.00 WIB","Bayah","Akhwat","2026-09-01"],["UPA-Tri","UPA Tri","Tri Kusumasari","Madya","Ahad, 06.00 WIB","Bayah","Akhwat","2026-09-01"],["UPA-Hindun","UPA Hindun","Hindun Sriwidadi Lestari","Madya","Ahad, 06.00 WIB","Bayah","Akhwat","2026-09-01"],["UPA-Komarudin","UPA Komarudin","Komarudin","Pratama","Ahad, 06.00 WIB","Rangkasbitung","Ikhwan","2026-09-01"],["UPA-Ivan","UPA Ivan","Ivan Said Afandi","Pratama","Ahad, 06.00 WIB","Rangkasbitung","Ikhwan","2026-09-01"],["UPA-Dedih","UPA Dedih","Dedih","Pratama","Ahad, 06.00 WIB","Curugbitung","Ikhwan","2026-09-01"],["UPA-Sanuji","UPA Sanuji","Sanuji Pentamarta","Pratama","Ahad, 06.00 WIB","Warunggunung","Ikhwan","2026-09-01"],["UPA-Jaenudin","UPA Jaenudin","Jaenudin","Pratama","Ahad, 06.00 WIB","Panggarangan","Ikhwan","2026-09-01"],["UPA-Ramdani","UPA Ramdani","Ramdani Saadillah","Pratama","Ahad, 06.00 WIB","Panggarangan","Ikhwan","2026-09-01"],["UPA-Nairoh","UPA Nairoh","Nairoh","Pratama","Ahad, 06.00 WIB","Cibadak","Akhwat","2026-09-01"],["UPA-Nurhayati","UPA Nurhayati","Nurhayati","Pratama","Ahad, 06.00 WIB","Kalanganyar","Akhwat","2026-09-01"],["UPA-Umi","UPA Umi","Umi Rohayati","Pratama","Ahad, 06.00 WIB","Rangkasbitung","Akhwat","2026-09-01"],["UPA-Novitasari","UPA Novitasari","Novitasari Nur Rahmi","Pratama","Ahad, 06.00 WIB","Maja","Akhwat","2026-09-01"],["UPA-Tuti","UPA Tuti","Tuti Herawati","Pratama","Ahad, 06.00 WIB","Rangkasbitung","Akhwat","2026-09-01"],["UPA-Kartinah","UPA Kartinah","Kartinah","Pratama","Ahad, 06.00 WIB","Leuwidamar","Akhwat","2026-09-01"],["UPA-Reka","UPA Reka","Reka Nurhasanah","Pratama","Ahad, 06.00 WIB","Bayah","Akhwat","2026-09-01"],["UPA-Melly","UPA Melly","Melly Andriani","Pratama","Ahad, 06.00 WIB","Bayah","Akhwat","2026-09-01"],["UPA-Siska","UPA Siska","Siska Amelia Arizona","Pratama","Ahad, 06.00 WIB","Cibeber","Akhwat","2026-09-01"],["UPA-Imas","UPA Imas","Imas Erawati (Mamas)","Pratama","Ahad, 06.00 WIB","Cilograng","Akhwat","2026-09-01"],["UPA-Mukmin","UPA Mukmin","Mukmin","Muda","Ahad, 06.00 WIB","Rangkasbitung","Ikhwan","2026-09-01"],["UPA-Bustomi","UPA Bustomi","Bustomi","Muda","Ahad, 06.00 WIB","Cibadak","Ikhwan","2026-09-01"],["UPA-M","UPA M.","M. Lily Ramdhan","Muda","Ahad, 06.00 WIB","Rangkasbitung","Ikhwan","2026-09-01"],["UPA-Paryanto","UPA Paryanto","Paryanto","Muda","Ahad, 06.00 WIB","Rangkasbitung","Ikhwan","2026-09-01"],["UPA-Yayat","UPA Yayat","Yayat Hidayatullah","Muda","Ahad, 06.00 WIB","Kalanganyar","Ikhwan","2026-09-01"],["UPA-Mistar","UPA Mistar","Mistar 1","Muda","Ahad, 06.00 WIB","Gunung Kencana","Ikhwan","2026-09-01"],["UPA-Eli","UPA Eli","Eli Suhaeli (DPC Sajira)","Muda","Ahad, 06.00 WIB","Sajira","Ikhwan","2026-09-01"],["UPA-Ali","UPA Ali","Ali Sobara","Muda","Ahad, 06.00 WIB","Malingping","Ikhwan","2026-09-01"],["UPA-Agus","UPA Agus","Agus Hermawan (Aziz) (DPC Malingping)","Muda","Ahad, 06.00 WIB","Malingping","Ikhwan","2026-09-01"],["UPA-Tantri","UPA Tantri","Tantri Mega Sanjaya","Muda","Ahad, 06.00 WIB","Rangkasbitung","Akhwat","2026-09-01"],["UPA-Mamah","UPA Mamah","Mamah Maryamah","Muda","Ahad, 06.00 WIB","Cibadak","Akhwat","2026-09-01"],["UPA-Ice","UPA Ice","Ice Maria","Muda","Ahad, 06.00 WIB","Cibeber","Akhwat","2026-09-01"],["UPA-Eko","UPA Eko","Eko Santoso (DPC Maja)","Pemula","Ahad, 06.00 WIB","Maja","Ikhwan","2026-09-01"],["UPA-Baedowi","UPA Baedowi","Baedowi (DPC Cirinten)","Pemula","Ahad, 06.00 WIB","Cirinten","Ikhwan","2026-09-01"],["UPA-Yayan","UPA Yayan","Yayan Ridwan (DPC Banjarsari)","Pemula","Ahad, 06.00 WIB","Gunung Kencana","Ikhwan","2026-09-01"],["UPA-Juhedi","UPA Juhedi","Juhedi","Pemula","Ahad, 06.00 WIB","Cibeber","Ikhwan","2026-09-01"],["UPA-Sudin","UPA Sudin","Sudin (DPC Cijaku)","Pemula","Ahad, 06.00 WIB","Cijaku","Ikhwan","2026-09-01"],["UPA-Heriyanto","UPA Heriyanto","Heriyanto (DPC Wanasalam)","Pemula","Ahad, 06.00 WIB","Wanasalam","Ikhwan","2026-09-01"],["UPA-Didin","UPA Didin","Didin Jumaedi Sukandi (DPC Cibadak)","Pemula","Ahad, 06.00 WIB","Cibadak","Ikhwan","2026-09-01"],["UPA-H","UPA H.","H. Aliyudin (DPC Bojongmanik)","Pemula","Ahad, 06.00 WIB","Bojongmanik","Ikhwan","2026-09-01"],["UPA-Poni","UPA Poni","Poni Kusniati","Pemula","Ahad, 06.00 WIB","Rangkasbitung","Akhwat","2026-09-01"],["UPA-Bayi","UPA Bayi","Bayi Farihah","Pemula","Ahad, 06.00 WIB","Wanasalam","Akhwat","2026-09-01"],["UPA-Eneng","UPA Eneng","Eneng Siti Rohmah","Pemula","Ahad, 06.00 WIB","Panggarangan","Akhwat","2026-09-01"],["UPA-Esri","UPA Esri","Esri Purmaningsih","Pemula","Ahad, 06.00 WIB","Bayah","Akhwat","2026-09-01"],["UPA-Sri","UPA Sri","Sri Rahmawati","Pemula","Ahad, 06.00 WIB","Bayah","Akhwat","2026-09-01"],["UPA-Sriyantini","UPA Sriyantini","Sriyantini","Pemula","Ahad, 06.00 WIB","Bayah","Akhwat","2026-09-01"]];
}

function injectMasterKaderDataset(ss, forceOverwrite) {
  if (!ss) ss = getSpreadsheet();
  if (!ss) return { status: 'error', message: 'Spreadsheet tidak ditemukan' };

  let sheetKader = getSheetByNameFlexible(ss, SHEETS.KADER);
  if (!sheetKader) {
    setupSheet(ss, SHEETS.KADER, ['ID', 'NIK_KTA', 'Nama', 'JK', 'NoWA', 'Kecamatan', 'Desa', 'UPA_ID', 'Jenjang', 'Status', 'Foto', 'DibuatPada'], []);
    sheetKader = getSheetByNameFlexible(ss, SHEETS.KADER);
  }

  let sheetUpa = getSheetByNameFlexible(ss, SHEETS.UPA);
  if (!sheetUpa) {
    setupSheet(ss, SHEETS.UPA, ['ID', 'NamaUPA', 'Pembimbing', 'Jenjang', 'Jadwal', 'Kecamatan', 'Kategori', 'DibuatPada'], []);
    sheetUpa = getSheetByNameFlexible(ss, SHEETS.UPA);
  }

  if (sheetKader.getLastRow() > 1 && !forceOverwrite) {
    return { status: 'already_exists', message: 'Sheet DB_KADER sudah memiliki data (' + (sheetKader.getLastRow() - 1) + ' kader).' };
  }

  // 1. Tulis Kader ke DB_KADER
  const kaderRows = getMasterKaderSeedRows();
  if (sheetKader.getLastRow() > 1) {
    sheetKader.getRange(2, 1, sheetKader.getLastRow() - 1, sheetKader.getLastColumn()).clearContent();
  }
  if (kaderRows.length > 0) {
    sheetKader.getRange(2, 1, kaderRows.length, kaderRows[0].length).setValues(kaderRows);
  }

  // 2. Tulis UPA ke DB_UPA
  const upaRows = getMasterUpaSeedRows();
  if (sheetUpa.getLastRow() > 1 && forceOverwrite) {
    sheetUpa.getRange(2, 1, sheetUpa.getLastRow() - 1, sheetUpa.getLastColumn()).clearContent();
  }
  if (sheetUpa.getLastRow() <= 1 && upaRows.length > 0) {
    sheetUpa.getRange(2, 1, upaRows.length, upaRows[0].length).setValues(upaRows);
  }

  // Invalidate cache
  try { if (typeof invalidateInitialDataCache === 'function') invalidateInitialDataCache(); } catch (e) { }

  return {
    status: 'success',
    message: 'Berhasil mengompilasi ' + kaderRows.length + ' Kader Resmi se-Kabupaten Lebak & ' + upaRows.length + ' UPA ke Google Sheets DB_KADER!',
    kaderCount: kaderRows.length,
    upaCount: upaRows.length
  };
}

/**
 * Helper: Validasi nama kecamatan se-Kabupaten Lebak (28 Kecamatan)
 */
function isKecamatanLebak(val) {
  if (!val || typeof val !== 'string') return false;
  const clean = val.trim().toLowerCase();
  const kecList = [
    'rangkasbitung', 'kalanganyar', 'cibadak', 'warunggunung', 'maja', 'curugbitung',
    'sajira', 'cimarga', 'cipanas', 'leuwidamar', 'sobang', 'lebakgedong', 'muncang',
    'bojongmanik', 'cirinten', 'gunungkencana', 'gunung kencana', 'cileles', 'cikulur', 'banjarsari',
    'cihara', 'malingping', 'panggarangan', 'bayah', 'cilograng', 'cibeber', 'cijaku', 'cigemblong', 'wanasalam'
  ];
  return kecList.some(k => clean.includes(k));
}

function aggregateAllJenjangSheetsToDBKader(ss, forceOverwrite) {
  if (!ss) ss = getSpreadsheet();
  if (!ss) return { status: 'error', message: 'Spreadsheet tidak ditemukan' };

  let sheetKader = getSheetByNameFlexible(ss, SHEETS.KADER);
  if (sheetKader && sheetKader.getLastRow() > 1 && !forceOverwrite) {
    return { status: 'already_exists', message: 'Sheet DB_KADER sudah memiliki data (' + (sheetKader.getLastRow() - 1) + ' kader).' };
  }

  const jenjangKeys = ['utama', 'dewasa', 'madya', 'pratama', 'muda', 'pemula', 'siaga'];
  const allSheets = ss.getSheets();
  const matchedSheets = [];

  for (let i = 0; i < allSheets.length; i++) {
    const s = allSheets[i];
    const sNameLower = s.getName().trim().toLowerCase();
    for (let j = 0; j < jenjangKeys.length; j++) {
      if (sNameLower.indexOf(jenjangKeys[j]) !== -1) {
        matchedSheets.push({ sheet: s, jenjangName: capitalizeWord(jenjangKeys[j]) });
        break;
      }
    }
  }

  if (matchedSheets.length === 0) {
    // Sheet jenjang mentah tidak ditemukan di Google Sheet aktif.
    // Otomatis inject 761 Kader Resmi & 75 UPA dari Master Database DPD Lebak!
    return injectMasterKaderDataset(ss, forceOverwrite);
  }

  const allKaderRows = [];
  const upaMap = {};
  let kaderCounter = 1;

  for (let sIdx = 0; sIdx < matchedSheets.length; sIdx++) {
    const item = matchedSheets[sIdx];
    const s = item.sheet;
    const defaultJenjang = item.jenjangName;
    const values = s.getDataRange().getValues();
    if (!values || values.length <= 1) continue;

    const headers = values[0].map(h => String(h || '').trim().toLowerCase());
    
    // Temukan index kolom
    let namaCol = -1;
    let kecCol = -1;
    let nowaCol = -1;
    let upaCol = -1;
    let pembimbingCol = -1;
    let jenjangCol = -1;
    let lCol = -1;
    let pCol = -1;
    let desaCol = -1;
    let nikCol = -1;

    for (let c = 0; c < headers.length; c++) {
      const h = headers[c];
      if (h === 'nama' || (h.indexOf('nama') !== -1 && h.indexOf('pembimbing') === -1 && h.indexOf('calon') === -1 && h.indexOf('upa') === -1)) {
        if (namaCol === -1) namaCol = c;
      }
      if (h === 'kecamatan' || h === 'dpc') kecCol = c;
      if (h === 'desa' || h === 'kelurahan' || h === 'dpra') desaCol = c;
      if (h === 'jenjang') jenjangCol = c;
      if (h === 'kode upa' || h === 'upa' || h === 'kode_upa') upaCol = c;
      if (h.indexOf('pembimbing') !== -1 || h.indexOf('murabbi') !== -1) pembimbingCol = c;
      if (h === 'l' || h === 'laki-laki' || h === 'ikhwan') lCol = c;
      if (h === 'p' || h === 'perempuan' || h === 'akhwat') pCol = c;
      if (h === 'no. hp' || h === 'no hp' || h === 'nowa' || h === 'wa' || h === 'telepon') {
        if (c !== 9) nowaCol = c; // Kolom J (index 9) seringkali nomor HP Pembimbing
      }
      if (h.indexOf('kta') !== -1 || h.indexOf('nik') !== -1) nikCol = c;
    }

    // Default fallback columns sesuai template DPW PKS Lebak jika header dinamis tidak ditemukan
    if (namaCol === -1) namaCol = 11; // Kolom L
    if (kecCol === -1) kecCol = 12;  // Kolom M
    if (nowaCol === -1) nowaCol = 13; // Kolom N
    if (upaCol === -1) upaCol = 5;    // Kolom F
    if (pembimbingCol === -1) pembimbingCol = 8; // Kolom I
    if (lCol === -1) lCol = 3;        // Kolom D
    if (pCol === -1) pCol = 4;        // Kolom E

    for (let r = 1; r < values.length; r++) {
      const row = values[r];
      const rawNama = String(row[namaCol] || '').trim();
      if (!rawNama || rawNama.toLowerCase() === 'nama' || rawNama.toLowerCase().startsWith('total') || rawNama.toLowerCase().startsWith('jumlah') || /^\d+\s*(upa|anggota|orang)/i.test(rawNama)) {
        continue;
      }

      const isAkhwat = (pCol >= 0 && String(row[pCol] || '').trim() === '1') || (lCol >= 0 && String(row[lCol] || '').trim() === '0');
      const jk = isAkhwat ? 'Akhwat' : 'Ikhwan';

      const jenjangVal = (jenjangCol >= 0 && String(row[jenjangCol] || '').trim()) || defaultJenjang;
      let kecVal = (kecCol >= 0 && String(row[kecCol] || '').trim()) || '';
      const desaVal = (desaCol >= 0 && String(row[desaCol] || '').trim()) || '';
      let nowaVal = (nowaCol >= 0 && String(row[nowaCol] || '').trim()) || '';
      if (nowaVal.startsWith("'")) nowaVal = nowaVal.substring(1);

      // Koreksi jika nama kecamatan dan no. telepon tertukar (seperti di sheet Pratama)
      if (isKecamatanLebak(nowaVal)) {
        kecVal = nowaVal;
        nowaVal = '';
      }
      if (/^08\d{8,12}$/i.test(kecVal.replace(/[-+\s]/g, '')) || /^\+?628\d{8,12}$/i.test(kecVal.replace(/[-+\s]/g, ''))) {
        nowaVal = kecVal;
        kecVal = 'Rangkasbitung';
      }
      if (!kecVal) kecVal = 'Rangkasbitung';
      
      const upaCode = (upaCol >= 0 && String(row[upaCol] || '').trim()) || '';
      const pembimbingVal = (pembimbingCol >= 0 && String(row[pembimbingCol] || '').trim()) || '';
      const nikVal = (nikCol >= 0 && String(row[nikCol] || '').trim()) || '';

      const kaderId = 'KDR-' + String(kaderCounter).padStart(4, '0');
      kaderCounter++;

      const upaIdClean = upaCode || (pembimbingVal ? ('UPA-' + pembimbingVal.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '')) : 'Belum Ditentukan');

      allKaderRows.push([
        kaderId,
        nikVal,
        rawNama,
        jk,
        nowaVal,
        kecVal,
        desaVal,
        upaIdClean,
        jenjangVal,
        'Aktif',
        '', // Foto
        Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss')
      ]);

      // Catat daftar UPA
      if (upaCode || pembimbingVal) {
        const uKey = upaIdClean;
        if (!upaMap[uKey]) {
          upaMap[uKey] = {
            ID: upaIdClean,
            NamaUPA: 'UPA ' + (pembimbingVal ? pembimbingVal.split(' ')[0] : upaCode),
            Pembimbing: pembimbingVal || 'Belum Ditentukan',
            Jenjang: jenjangVal,
            Jadwal: 'Ahad, 06.00 WIB',
            Kecamatan: kecVal,
            Kategori: jk,
            DibuatPada: Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss')
          };
        }
      }
    }
  }

  if (allKaderRows.length === 0) {
    return injectMasterKaderDataset(ss, forceOverwrite);
  }

  // Tulis ke DB_KADER
  if (!sheetKader) {
    sheetKader = ss.insertSheet(SHEETS.KADER);
  } else if (forceOverwrite) {
    sheetKader.clear();
  }

  const kaderHeaders = ['ID', 'NIK_KTA', 'Nama', 'JK', 'NoWA', 'Kecamatan', 'Desa', 'UPA_ID', 'Jenjang', 'Status', 'Foto', 'DibuatPada'];
  sheetKader.getRange(1, 1, 1, kaderHeaders.length).setValues([kaderHeaders])
    .setFontWeight('bold').setBackground('#FF6B00').setFontColor('#FFFFFF');
  sheetKader.setFrozenRows(1);
  sheetKader.getRange(2, 1, allKaderRows.length, kaderHeaders.length).setValues(allKaderRows);

  // Tulis ke DB_UPA
  const upaListRows = Object.values(upaMap).map(u => [
    u.ID,
    u.NamaUPA,
    u.Pembimbing,
    u.Jenjang,
    u.Jadwal,
    u.Kecamatan,
    u.Kategori,
    u.DibuatPada
  ]);

  if (upaListRows.length > 0) {
    let sheetUpa = getSheetByNameFlexible(ss, SHEETS.UPA);
    if (!sheetUpa) {
      sheetUpa = ss.insertSheet(SHEETS.UPA);
    } else if (forceOverwrite || sheetUpa.getLastRow() <= 1) {
      sheetUpa.clear();
    }
    const upaHeaders = ['ID', 'NamaUPA', 'Pembimbing', 'Jenjang', 'Jadwal', 'Kecamatan', 'Kategori', 'DibuatPada'];
    sheetUpa.getRange(1, 1, 1, upaHeaders.length).setValues([upaHeaders])
      .setFontWeight('bold').setBackground('#FF6B00').setFontColor('#FFFFFF');
    sheetUpa.setFrozenRows(1);
    sheetUpa.getRange(2, 1, upaListRows.length, upaHeaders.length).setValues(upaListRows);
  }

  invalidateInitialDataCache();

  return {
    status: 'success',
    message: 'Berhasil mengompilasi ' + allKaderRows.length + ' data kader dan ' + upaListRows.length + ' kelompok UPA ke database resmi!',
    kaderCount: allKaderRows.length,
    upaCount: upaListRows.length
  };
}

function capitalizeWord(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * API: Pemicu Manual Migrasi & Kompilasi Seluruh Data Jenjang ke DB_KADER
 */
function apiMigrateJenjangSheetsToDBKader(forceOverwrite) {
  try {
    const ss = getSpreadsheet();
    if (!ss) return { status: 'error', message: 'Spreadsheet tidak ditemukan' };
    const res = aggregateAllJenjangSheetsToDBKader(ss, Boolean(forceOverwrite));
    return res;
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * API: Uji Koneksi Spreadsheet Realtime
 */
function apiTestConnection() {
  try {
    const ss = getSpreadsheet();
    if (!ss) return { status: 'error', message: 'Koneksi ke Spreadsheet gagal. Pastikan SPREADSHEET_ID valid.' };
    const sheets = ss.getSheets().map(s => s.getName());
    const sheetKader = getSheetByNameFlexible(ss, SHEETS.KADER);
    const kaderCount = sheetKader ? Math.max(0, sheetKader.getLastRow() - 1) : 0;
    const sheetUpa = getSheetByNameFlexible(ss, SHEETS.UPA);
    const upaCount = sheetUpa ? Math.max(0, sheetUpa.getLastRow() - 1) : 0;
    return {
      status: 'success',
      spreadsheetName: ss.getName(),
      spreadsheetId: ss.getId(),
      sheets: sheets,
      kaderCount: kaderCount,
      upaCount: upaCount,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
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

    // AUTO-AGGREGATE & SEED GUARD: Jika sheet DB_KADER atau DB_UPA belum ada atau belum punya data (<= 1 baris), inisialisasi sheet otomatis
    let sheetKader = sheetMap['db_kader'] || sheetMap['kader'] || getSheetByNameFlexible(ss, SHEETS.KADER);
    let sheetUPA = sheetMap['db_upa'] || sheetMap['upa'] || getSheetByNameFlexible(ss, SHEETS.UPA);
    if (!sheetKader || sheetKader.getLastRow() <= 1) {
      try {
        aggregateAllJenjangSheetsToDBKader(ss, false);
        sheetMap = buildSheetMap(ss);
        sheetKader = sheetMap['db_kader'] || sheetMap['kader'] || getSheetByNameFlexible(ss, SHEETS.KADER);
        sheetUPA = sheetMap['db_upa'] || sheetMap['upa'] || getSheetByNameFlexible(ss, SHEETS.UPA);
      } catch (aggErr) {
        console.warn('Auto-aggregate jenjang warning in apiGetInitialData:', aggErr);
      }
    }
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
  const masterKaderRows = (typeof getMasterKaderSeedRows === 'function') ? getMasterKaderSeedRows() : [];
  const masterUpaRows = (typeof getMasterUpaSeedRows === 'function') ? getMasterUpaSeedRows() : [];

  const kaderList = masterKaderRows.length > 0 ? masterKaderRows.map(r => ({
    ID: r[0] || '',
    NIK_KTA: r[1] || '',
    Nama: r[2] || '',
    JK: r[3] || 'Ikhwan',
    NoWA: r[4] || '',
    Kecamatan: r[5] || 'Rangkasbitung',
    Desa: r[6] || '',
    UPA_ID: r[7] || '',
    Jenjang: r[8] || 'Pemula',
    Status: r[9] || 'Aktif',
    Foto: r[10] || '',
    DibuatPada: r[11] || ''
  })) : [
    { ID: 'KDR-001', NIK_KTA: '3602101001920001', Nama: 'Murobbi', JK: 'Ikhwan', NoWA: '081234567890', Kecamatan: 'Rangkasbitung', Desa: 'Muara Ciujung Timur', UPA_ID: 'UPA-001', Jenjang: 'Madya', Status: 'Aktif' },
    { ID: 'KDR-002', NIK_KTA: '3602102505950002', Nama: 'H. Muhammad Rizqi, M.T.', JK: 'Ikhwan', NoWA: '081298765432', Kecamatan: 'Cibadak', Desa: 'Asem', UPA_ID: 'UPA-001', Jenjang: 'Pratama', Status: 'Aktif' },
    { ID: 'KDR-003', NIK_KTA: '3602101211980003', Nama: 'Kader', JK: 'Ikhwan', NoWA: '085712345678', Kecamatan: 'Warunggunung', Desa: 'Selaraja', UPA_ID: 'UPA-001', Jenjang: 'Muda', Status: 'Aktif' },
    { ID: 'KDR-004', NIK_KTA: '3602101908900004', Nama: 'Usth. Siti Khadijah, S.Ag', JK: 'Akhwat', NoWA: '087812345678', Kecamatan: 'Rangkasbitung', Desa: 'Cijoro Lebak', UPA_ID: 'UPA-002', Jenjang: 'Madya', Status: 'Aktif' },
    { ID: 'KDR-005', NIK_KTA: '3602100407990005', Nama: 'Nurul Aini, S.Si', JK: 'Akhwat', NoWA: '081398765432', Kecamatan: 'Kalanganyar', Desa: 'Sukamekarsari', UPA_ID: 'UPA-002', Jenjang: 'Muda', Status: 'Aktif' },
    { ID: 'KDR-006', NIK_KTA: '3602101503930006', Nama: 'Dedi Supriyadi', JK: 'Ikhwan', NoWA: '085211223344', Kecamatan: 'Malingping', Desa: 'Malingping Utara', UPA_ID: 'UPA-003', Jenjang: 'Pratama', Status: 'Aktif' },
    { ID: 'KDR-007', NIK_KTA: '3602102209970007', Nama: 'Irfan Hakim, S.T.', JK: 'Ikhwan', NoWA: '081900998877', Kecamatan: 'Bayah', Desa: 'Bayah Barat', UPA_ID: 'UPA-003', Jenjang: 'Muda', Status: 'Aktif' }
  ];

  const upaList = masterUpaRows.length > 0 ? masterUpaRows.map(u => ({
    ID: u[0] || '',
    NamaUPA: u[1] || '',
    Pembimbing: u[2] || '',
    Jenjang: u[3] || '',
    Jadwal: u[4] || 'Ahad, 06.00 WIB',
    Kecamatan: u[5] || 'Rangkasbitung',
    Kategori: u[6] || 'Ikhwan',
    DibuatPada: u[7] || ''
  })) : [
    { ID: 'UPA-001', NamaUPA: 'UPA Al-Fatih 1', Pembimbing: 'Murobbi', Jenjang: 'Muda - Pratama', Jadwal: 'Ahad, 06.00 WIB', Kecamatan: 'Rangkasbitung', Kategori: 'Ikhwan' },
    { ID: 'UPA-002', NamaUPA: 'UPA Khadijah 1', Pembimbing: 'Usth. Siti Khadijah, S.Ag', Jenjang: 'Muda - Pratama', Jadwal: 'Sabtu, 16.00 WIB', Kecamatan: 'Rangkasbitung', Kategori: 'Akhwat' },
    { ID: 'UPA-003', NamaUPA: 'UPA Shalahuddin 1', Pembimbing: 'Ust. Lukman Hakim', Jenjang: 'Pemula - Muda', Jadwal: 'Ahad, 08.00 WIB', Kecamatan: 'Malingping', Kategori: 'Ikhwan' }
  ];

  return {
    kaderList: kaderList,
    upaList: upaList,
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

