import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { 
  getFirestore, collection, doc, setDoc, addDoc, getDoc,
  onSnapshot, query, orderBy, deleteDoc, serverTimestamp 
} from 'firebase/firestore';
import { 
  Camera, FileText, Save, Plus, Trash2, Calendar, 
  Cloud, Users, HardHat, ChevronLeft, Image as ImageIcon,
  X, CheckCircle, Wand2, Loader2, AlertCircle, Download,
  Wind, Thermometer, ShieldAlert, Truck, Utensils, Boxes, Map,
  UserPlus, UserX, Copy, FilePlus, AlertTriangle, Search, Clock, RotateCcw, Key, LogIn, UserCheck, UserMinus
} from 'lucide-react';

// =================================================================
// 1. GEMINI ANAHTARI (LÜTFEN SADECE TIRNAKLARIN İÇİNİ DOLDURUN)
// =================================================================
const apiKey = "AIzaSyDd-zdLPx2jpLqyXiRtLpAMXGk8HoHiZZA"; 

// =================================================================
// 2. FIREBASE AYARLARI (LÜTFEN SADECE TIRNAKLARIN İÇİNİ DOLDURUN)
// =================================================================
const firebaseConfig = {
  apiKey: "AIzaSyDFWmDk_hRjb34vqnO7_ztdjdorGNiG_DI",
  authDomain: "santiyeapp-d271e.firebaseapp.com",
  projectId: "santiyeapp-d271e",
  storageBucket: "santiyeapp-d271e.firebasestorage.app",
  messagingSenderId: "49603872520",
  appId: "1:49603872520:web:f6c6ba0d5731b00a5f4ebd"
}; 

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'santiye-v1'; 
const commonProjectPath = 'default_project'; // Tüm raporlar bu ortak yola kaydedilecek

const resizeImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1000;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.6)); // Kalite biraz düşürüldü (0.6) daha çok fotoğraf için
      };
    };
  });
};

// Derece düzeltici
const formatTemp = (val) => {
    if (!val) return "-";
    const cleanVal = val.toString().replace(/[^0-9.-]/g, ''); 
    return `${cleanVal}°C`;
};

// Kişi listesini göreve göre gruplayan ve sıralayan helper
const groupEmployeesByRole = (employees, staffGroups) => {
    if (!employees || employees.length === 0) return [];
    
    const activeEmployees = employees.filter(e => e.status !== 'pending_exit' && e.status !== 'exited');
    
    const grouped = {};
    activeEmployees.forEach(emp => {
        const role = emp.role || 'Tanımsız';
        if (!grouped[role]) grouped[role] = [];
        grouped[role].push(emp);
    });

    const sortedRoles = staffGroups.map(s => s.role).filter(role => grouped[role]);
    
    const sortedList = [];
    sortedRoles.forEach(role => {
        sortedList.push(...grouped[role]);
        delete grouped[role];
    });

    Object.keys(grouped).forEach(role => {
        sortedList.push(...grouped[role]);
    });

    return sortedList;
};


export default function SantiyeGunlugu() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('auth_screen'); 
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [pdfReady, setPdfReady] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [displayName, setDisplayName] = useState(''); // Kullanıcının Görünen Adı
  
  const [pendingRemoval, setPendingRemoval] = useState(null); 
  const [showNewReportDialog, setShowNewReportDialog] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState('');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false); // Kayıt modunda mı?
  const [newDisplayName, setNewDisplayName] = useState(''); // Yeni kullanıcı adı
  
  const [currentReportId, setCurrentReportId] = useState(null);
  const [formData, setFormData] = useState({
    reportNo: '1',
    contractNo: '',
    projectTitle: 'Merkez Ofis İnşaatı',
    contractor: 'Ana Yüklenici A.Ş.',
    location: 'İstanbul',
    date: new Date().toISOString().split('T')[0],
    weather: 'Güneşli',
    tempMax: '25',
    tempMin: '18',
    isWindy: false,
    staff: [], 
    safety: { toolboxTalk: false, accident: false, highRisk: false, envSpill: false },
    equipment: [],
    projectUpdate: '',
    impactNotes: '',
    notes: '',
    meals: 0,
    concrete: { poured: false, quantity: '', planImage: null },
    rebar: '',
    otherMaterials: [],
    tasks: [], 
    images: [],
    employeeList: [],
    enteredBy: '', 
    enteredUID: '', 
  });


  // Geri alma sayacı
  useEffect(() => {
    if (pendingRemoval) {
        const timer = setInterval(() => {
            setPendingRemoval(prev => {
                if (!prev) return null;
                if (prev.timer <= 1) {
                    setFormData(prevForm => {
                        const updatedList = prevForm.employeeList.map(emp => {
                            if (emp.id === prev.id) {
                                return { ...emp, status: 'exited' }; 
                            }
                            return emp;
                        });
                        return { ...prevForm, employeeList: updatedList };
                    });
                    return null;
                }
                return { ...prev, timer: prev.timer - 1 };
            });
        }, 1000);
        return () => clearInterval(timer);
    }
  }, [pendingRemoval, formData.employeeList]);


  // ** AUTH İŞLEMİ VE GİRİŞ **
  useEffect(() => {
    // Auth işlemi tamamlandığında loading'i false yap ki giriş/kayıt ekranı gelsin
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
        setUser(u);
        if (u) {
            // Kullanıcı giriş yaptı, Display Name'i var mı kontrol et
            const userDocRef = doc(db, 'user_data', u.uid);
            const userDoc = await getDoc(userDocRef);
            
            if (userDoc.exists()) {
                setDisplayName(userDoc.data().name);
                setView('list'); // İsim varsa direkt listeye git
            } else {
                setView('name_setup'); // İsim yoksa isim belirleme ekranına git
            }
        }
        setLoading(false); 
    });
    return () => unsubscribe();
  }, []);

  // --- VERİ YÜKLEME (Ortak Proje Yolu) ---
  useEffect(() => {
    if (!user || view !== 'list') return;
    
    // Veri yolu: artifacts/appId/projects/default_project/daily_reports
    const q = query(
      collection(db, 'artifacts', appId, 'projects', commonProjectPath, 'daily_reports'),
      orderBy('date', 'asc') // Rapor 1 en altta olacak şekilde artan sıralama
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setReports(data);
    });
    return () => unsubscribe();
  }, [user, view]);


  // --- OTOMATİK HESAPLAMA MOTORU (4. ve 6. Bölüm Senkronizasyonu) ---
  useEffect(() => {
    setFormData(prev => {
        const workingStaff = (prev.employeeList || []).filter(e => e.status === 'active' && e.attendance === 'worked');
        const totalStaffCount = workingStaff.length; 
        
        const roleMetrics = {};
        workingStaff.forEach(emp => {
            const role = emp.role || "Tanımsız";
            if (!roleMetrics[role]) {
                roleMetrics[role] = { count: 0, overtime: 0 };
            }
            roleMetrics[role].count += 1;
            if (emp.hasOvertime) {
                roleMetrics[role].overtime += Number(emp.overtimeHours || 0);
            }
        });

        let newStaff = [];
        
        Object.keys(roleMetrics).forEach(role => {
            const existingGroup = prev.staff.find(s => s.role === role);
            const count = roleMetrics[role].count;
            const overtime = roleMetrics[role].overtime;
            const hours = (count * 8) + overtime;

            if (count > 0) {
                 newStaff.push({
                    role: role,
                    count: count,
                    company: existingGroup ? existingGroup.company : 'Girilmedi', 
                    hours: hours
                });
            }
        });

        prev.staff.forEach(s => {
            // Sadece rolü boş olmayanları koru
            if (!newStaff.find(ns => ns.role === s.role) && s.role !== '') {
                newStaff.push({ ...s, count: 0, hours: 0 }); 
            }
        });
        
        const isMealsChanged = prev.meals != totalStaffCount;
        const isStaffChanged = JSON.stringify(newStaff) !== JSON.stringify(prev.staff);

        if (isMealsChanged || isStaffChanged) {
            return { ...prev, meals: totalStaffCount, staff: newStaff };
        }
        return prev;
    });
  }, [formData.employeeList, formData.staff]); 

  // SADECE TARİH DEĞİŞİNCE AYRILANLARI TEMİZLEME
  useEffect(() => {
    setFormData(prev => {
        if (!prev.date || !prev.employeeList) return prev;
        const reportDate = new Date(prev.date);
        const reportMonth = reportDate.getMonth();
        const reportYear = reportDate.getFullYear();
        const cleanList = prev.employeeList.filter(emp => {
            if (emp.status !== 'exited') return true; 
            if (emp.exitDate) {
                const exitDate = new Date(emp.exitDate);
                return exitDate.getMonth() === reportMonth && exitDate.getFullYear() === reportYear;
            }
            return false; 
        });
        if (cleanList.length !== prev.employeeList.length) return { ...prev, employeeList: cleanList };
        return prev;
    });
  }, [formData.date]); 

  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    script.async = true;
    script.onload = () => setPdfReady(true);
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    }
  }, []);

  const handleGetWeatherAI = async () => {
    if (!formData.location || !formData.date) {
        setStatusMsg({ type: 'error', text: "Lütfen önce Konum ve Tarih girin." });
        setTimeout(() => setStatusMsg(null), 3000);
        return;
    }
    setWeatherLoading(true);
    try {
        const prompt = `
            Verilen konum ve tarih için tahmini hava durumu verilerini JSON formatında ver.
            Konum: ${formData.location}
            Tarih: ${formData.date}
            Cevap sadece şu JSON formatında olsun (Sayılar sade olsun, birim yazma):
            { "weather": "...", "tempMax": "25", "tempMin": "18", "isWindy": true/false }
        `;
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
        );
        const data = await response.json();
        if (data.candidates && data.candidates[0].content) {
            const textResponse = data.candidates[0].content.parts[0].text;
            const cleanJson = textResponse.replace(/```json|```/g, '').trim();
            const weatherData = JSON.parse(cleanJson);
            setFormData(prev => ({ ...prev, ...weatherData }));
            setStatusMsg({ type: 'success', text: "Hava durumu güncellendi!" });
        }
    } catch (error) {
        setStatusMsg({ type: 'error', text: "Hava durumu alınamadı." });
    } finally {
        setWeatherLoading(false);
        setTimeout(() => setStatusMsg(null), 3000);
    }
  };

  const handleAiEnhance = async () => {
    if (!formData.notes && formData.tasks.length === 0) {
      setStatusMsg({ type: 'error', text: "Lütfen önce biraz veri girin." });
      return;
    }
    setAiLoading(true);
    try {
      const prompt = `
        Sen bir inşaat mühendisisin. Günlük rapor özeti yaz.
        İşler: ${formData.tasks.map(t => t.description).join(', ')}
        Personel: ${formData.staff.map(s => s.role + ': ' + s.count).join(', ')}
        Notlar: ${formData.notes}
        Sadece özeti ver.
      `;
      const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
        );
      const data = await response.json();
      if (data.candidates) {
        setFormData(prev => ({ ...prev, notes: data.candidates[0].content.parts[0].text }));
        setStatusMsg({ type: 'success', text: "Özetlendi!" });
      }
    } catch (error) {
      setStatusMsg({ type: 'error', text: "AI hatası." });
    } finally {
      setAiLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!pdfReady) return;
    const element = document.getElementById('printable-area');
    const opt = {
      margin: 10, 
      filename: `Rapor_${formData.date}_${formData.projectTitle}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };
    window.html2pdf().set(opt).from(element).save();
  };

  const handleSave = async () => {
    if (!user || !displayName) return;
    try {
      const { id, ...dataToSave } = formData;
      const reportData = { 
          ...dataToSave, 
          // Görünen İsim kaydediliyor
          enteredBy: displayName, 
          enteredUID: user.uid,
          updatedAt: serverTimestamp() 
      };

      // Ortak Kayıt yolu: artifacts/appId/projects/default_project/daily_reports
      const collectionRef = collection(db, 'artifacts', appId, 'projects', commonProjectPath, 'daily_reports');
      if (currentReportId) await setDoc(doc(collectionRef, currentReportId), reportData);
      else await addDoc(collectionRef, { ...reportData, createdAt: serverTimestamp() });
      setView('list');
    } catch (error) {
      setStatusMsg({ type: 'error', text: "Kaydedilemedi." });
      console.error(error);
    }
  };

  const normalizeImages = (images) => images ? images.map(img => (typeof img === 'string' ? { url: img, description: '' } : img)) : [];

  const handleNewReportClick = () => {
    setSelectedSourceId(reports.length > 0 ? reports[0].id : '');
    setShowNewReportDialog(true);
  };

  const createNewReportFromSelection = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    let maxReportNo = 0;
    reports.forEach(r => { const num = parseInt(r.reportNo); if (!isNaN(num) && num > maxReportNo) maxReportNo = num; });
    
    let newReportData = {};
    if (selectedSourceId) {
      const sourceReport = reports.find(r => r.id === selectedSourceId);
      if (sourceReport) {
        const copiedEmployees = (sourceReport.employeeList || []).map(emp => ({
            ...emp,
            attendance: emp.attendance || 'worked', 
            absenceReason: emp.absenceReason || '', 
            hasOvertime: false,
            overtimeHours: 0,
            exitDate: ''
        }));

        newReportData = {
          ...sourceReport,
          date: todayStr,
          reportNo: (maxReportNo + 1).toString(),
          weather: 'Güneşli',
          tasks: sourceReport.tasks || [], 
          images: [], 
          notes: '',
          concrete: { poured: false, quantity: '', planImage: null },
          employeeList: copiedEmployees,
          id: null, createdAt: null, updatedAt: null,
          enteredBy: displayName, 
          enteredUID: user.uid, 
        };
      }
    } 
    
    if (!selectedSourceId || !newReportData.projectTitle) {
       newReportData = { ...formData, reportNo: (maxReportNo + 1).toString(), date: todayStr, staff: [], employeeList: [], tasks: [], images: [], notes: '', equipment: [], enteredBy: displayName, enteredUID: user.uid };
    }

    setFormData(newReportData);
    setCurrentReportId(null);
    setShowNewReportDialog(false);
    setView('form');
  };

  const handleEditReport = (report) => {
    setFormData({ 
        ...report, 
        images: normalizeImages(report.images),
        concrete: { poured: false, quantity: '', planImage: null, ...report.concrete },
        employeeList: report.employeeList || []
    });
    setCurrentReportId(report.id);
    setView('form');
  };

  const handleViewReport = (report) => {
    setFormData({ 
        ...report, 
        images: normalizeImages(report.images),
        concrete: { poured: false, quantity: '', planImage: null, ...report.concrete },
        employeeList: report.employeeList || []
    });
    setCurrentReportId(report.id);
    setView('view');
  };

  const handleDeleteClick = (id, e) => { e.stopPropagation(); setDeleteId(id); };
  const confirmDelete = async () => {
    if (!user || !deleteId) return;
    try { 
        await deleteDoc(doc(db, 'artifacts', appId, 'projects', commonProjectPath, 'daily_reports', deleteId)); 
        setDeleteId(null); 
        setStatusMsg({ type: 'success', text: "Silindi." }); 
    }
    catch (error) { 
        setStatusMsg({ type: 'error', text: "Hata." }); 
        console.error(error);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const resizedBase64 = await resizeImage(file);
      setFormData(prev => ({ ...prev, images: [...prev.images, { url: resizedBase64, description: '' }] }));
    } catch (error) {}
  };

  const handleConcretePlanUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const resizedBase64 = await resizeImage(file);
      setFormData(prev => ({ ...prev, concrete: { ...prev.concrete, planImage: resizedBase64 } }));
    } catch (error) {}
  };

  const removeImage = (index) => {
    setFormData(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
  };

  const updateImageDescription = (index, text) => {
    const newImages = [...formData.images];
    newImages[index].description = text;
    setFormData({...formData, images: newImages});
  };

  const updateStaff = (index, field, value) => {
    const newStaff = [...formData.staff];
    newStaff[index][field] = value;
    setFormData({ ...formData, staff: newStaff });
  };

  const addStaffGroup = () => {
    setFormData(prev => ({ 
        ...prev, 
        staff: [...prev.staff, { role: '', count: 0, company: '', hours: 0 }] 
    }));
  };

  const addEmployee = () => {
    setFormData(prev => {
        const newEmployee = {
            id: Date.now(), 
            name: '', 
            role: '', 
            status: 'active', 
            attendance: 'worked', 
            hasOvertime: false, 
            overtimeHours: 0, 
            absenceReason: '', 
            exitDate: '' 
        };
        const newList = [...(prev.employeeList || [])];
        
        let lastRole = '';
        const activeEmployees = newList.filter(e => e.status !== 'exited');
        if (activeEmployees.length > 0) {
             lastRole = activeEmployees[activeEmployees.length - 1].role;
        }

        if (lastRole && prev.staff.map(s => s.role).includes(lastRole)) {
            const lastIndex = newList.map(e => e.role).lastIndexOf(lastRole);
            if (lastIndex !== -1) {
                newList.splice(lastIndex + 1, 0, newEmployee);
                return { ...prev, employeeList: newList };
            }
        }
        
        newList.push(newEmployee);
        return { ...prev, employeeList: newList };
    });
  };

  const updateEmployee = (index, field, value) => {
    setPendingRemoval(null); 
    const newList = [...(formData.employeeList || [])];
    
    // Değeri güncelle
    newList[index][field] = value;
    
    // EĞER: Attendance değiştiyse ve yeni değer 'worked' ise, açıklamayı temizle
    if (field === 'attendance' && value === 'worked') {
        newList[index].absenceReason = '';
    }

    setFormData({ ...formData, employeeList: newList });
  };
  
  const terminateEmployeeWithUndo = (employee) => {
    const newEmployees = formData.employeeList.map(e => {
        if (e.id === employee.id) {
            return {
                ...e,
                status: 'pending_exit', 
                exitDate: formData.date,
                attendance: 'absent',
                absenceReason: 'ÇIKARILIYOR'
            };
        }
        return e;
    });

    setFormData(prev => ({ ...prev, employeeList: newEmployees }));
    setPendingRemoval({ id: employee.id, timer: 5, employeeData: employee });
  };

  const undoTermination = () => {
    if (!pendingRemoval) return;
    
    const restoredEmployees = formData.employeeList.map(e => {
        if (e.id === pendingRemoval.id) {
            return {
                ...e,
                status: 'active',
                exitDate: '',
                attendance: 'worked',
                absenceReason: ''
            };
        }
        return e;
    });

    setFormData(prev => ({ ...prev, employeeList: restoredEmployees }));
    setPendingRemoval(null); 
  };

  // --- SATIR SİLME FONKSİYONU (YANLIŞLIKLA EKLENENİ SİLMEK İÇİN) ---
  const deleteEmployeeRow = (id) => {
    setFormData(prev => ({
        ...prev,
        employeeList: prev.employeeList.filter(emp => emp.id !== id)
    }));
  };
  
  
  // --- AUTH ve KAYIT İŞLEMLERİ ---

  const handleKeySubmit = async (isRegister) => {
      setAuthLoading(true);
      setStatusMsg(null);
      try {
          if (isRegister) {
              await createUserWithEmailAndPassword(auth, email, password);
              // İsim belirleme ekranına geçiş
              setView('name_setup'); 
          } else {
              await signInWithEmailAndPassword(auth, email, password);
              // onAuthStateChanged tarafından listeye yönlendirilecek
          }
      } catch (error) {
          let message = 'Bir hata oluştu.';
          if (error.code === 'auth/invalid-email') {
              message = 'Geçersiz e-posta formatı.';
          } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
              message = 'E-posta veya şifre hatalı.';
          } else if (error.code === 'auth/email-already-in-use') {
              message = 'Bu e-posta adresi zaten kayıtlı.';
          } else if (error.code === 'auth/weak-password') {
              message = 'Şifre en az 6 karakter olmalıdır.';
          }
          setStatusMsg({ type: 'error', text: message });
      } finally {
          setAuthLoading(false);
      }
  };
  
  // Display Name Benzersizlik Kontrolü ve Kaydetme
  const handleDisplayNameSetup = async () => {
      setAuthLoading(true);
      setStatusMsg(null);
      const name = newDisplayName.trim();

      if (name.length < 3) {
          setStatusMsg({ type: 'error', text: 'Kullanıcı adı en az 3 karakter olmalıdır.' });
          setAuthLoading(false);
          return;
      }

      try {
          // 1. Benzersizlik Kontrolü
          const nameDocRef = doc(db, 'user_names', name.toLowerCase());
          const nameDoc = await getDoc(nameDocRef);

          if (nameDoc.exists()) {
              setStatusMsg({ type: 'error', text: `Kullanıcı adı '${name}' zaten alınmış.` });
              return;
          }

          // 2. İsim Kilitleme
          await setDoc(nameDocRef, { 
              uid: user.uid, 
              name: name,
              createdAt: serverTimestamp() 
          });

          // 3. Kullanıcı Bilgisini Kaydetme (Görünen isim)
          const userDocRef = doc(db, 'user_data', user.uid);
          await setDoc(userDocRef, { 
              name: name,
              email: user.email,
              createdAt: serverTimestamp() 
          });
          
          setDisplayName(name);
          setView('list'); // Başarılı, listeye git
      } catch (error) {
          setStatusMsg({ type: 'error', text: 'Kayıt sırasında bir hata oluştu.' });
          console.error("Display Name Setup Error:", error);
      } finally {
          setAuthLoading(false);
      }
  };


  // --- EKRAN GÖRÜNÜMÜ MANTIĞI ---

  if (loading) return <div className="flex items-center justify-center h-screen text-slate-500">Uygulama Yükleniyor...</div>;
  
  if (!user || view === 'auth_screen') {
      return (
          <div className="flex items-center justify-center h-screen bg-slate-50">
              <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-sm">
                  <UserCheck size={36} className="text-indigo-600 mx-auto mb-4"/>
                  <h2 className="text-2xl font-bold text-center mb-6">{isRegistering ? 'Yeni Kayıt' : 'Giriş Yap'}</h2>
                  
                  <input
                      type="email"
                      placeholder="E-posta"
                      className="w-full p-3 border rounded-lg mb-3 focus:border-indigo-500 outline-none"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={authLoading}
                  />
                  <input
                      type="password"
                      placeholder="Şifre"
                      className="w-full p-3 border rounded-lg mb-6 focus:border-indigo-500 outline-none"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleKeySubmit(isRegistering); }}
                      disabled={authLoading}
                  />
                  
                  <button
                      onClick={() => handleKeySubmit(isRegistering)}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50"
                      disabled={authLoading || email.length < 5 || password.length < 6}
                  >
                      {authLoading ? <Loader2 size={20} className="animate-spin"/> : <LogIn size={20} />} 
                      {isRegistering ? 'Hesap Oluştur' : 'Giriş Yap'}
                  </button>

                  <button
                      onClick={() => setIsRegistering(!isRegistering)}
                      className="w-full mt-4 text-sm text-indigo-500 hover:text-indigo-700 transition"
                      disabled={authLoading}
                  >
                      {isRegistering ? 'Zaten hesabım var (Giriş Yap)' : 'Yeni hesap oluştur'}
                  </button>

                  {statusMsg && <div className={`mt-4 text-center text-sm ${statusMsg.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>{statusMsg.text}</div>}
              </div>
          </div>
      );
  }

  // Kullanıcı giriş yaptı ama Görünen İsmi yok
  if (user && view === 'name_setup') {
      return (
          <div className="flex items-center justify-center h-screen bg-slate-50">
              <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-sm">
                  <UserPlus size={36} className="text-amber-600 mx-auto mb-4"/>
                  <h2 className="text-2xl font-bold text-center mb-2">Görünen İsim Belirle</h2>
                  <p className="text-sm text-slate-500 text-center mb-6">Raporlarda gözükecek benzersiz bir kullanıcı adı seçin.</p>
                  
                  <input
                      type="text"
                      placeholder="Örn: Canberk, ŞefBatu"
                      className="w-full p-3 border rounded-lg mb-6 focus:border-amber-500 outline-none"
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleDisplayNameSetup(); }}
                      disabled={authLoading}
                  />
                  
                  <button
                      onClick={handleDisplayNameSetup}
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50"
                      disabled={authLoading || newDisplayName.length < 3}
                  >
                      {authLoading ? <Loader2 size={20} className="animate-spin"/> : <UserCheck size={20} />} 
                      İsmi Kaydet
                  </button>

                  {statusMsg && <div className={`mt-4 text-center text-sm ${statusMsg.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>{statusMsg.text}</div>}
                  <button onClick={() => auth.signOut()} className="w-full mt-4 text-xs text-slate-500 hover:text-slate-800">Çıkış Yap</button>
              </div>
          </div>
      );
  }

  // --- ANA UYGULAMA (LİSTE) ---
  if (view === 'list') {
    return (
        <div className="max-w-lg mx-auto bg-slate-50 min-h-screen flex flex-col">
            {deleteId && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteId(null)}>
                  <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-3 text-red-600 mb-4"><Trash2 size={24} /><h3 className="text-lg font-bold text-slate-900">Silinsin mi?</h3></div>
                    <p className="text-slate-600 mb-6 text-sm">Bu rapor kalıcı olarak silinecek.</p>
                    <div className="flex gap-3 justify-end">
                        <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded font-medium text-sm">İptal</button>
                        <button onClick={confirmDelete} className="px-4 py-2 bg-red-600 text-white rounded font-medium text-sm">Evet, Sil</button>
                    </div>
                  </div>
                </div>
            )}
            {showNewReportDialog && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
                    <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2"><FilePlus className="text-blue-600"/> Yeni Rapor Oluştur</h3>
                    <div className="space-y-4">
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 cursor-pointer hover:bg-blue-100" onClick={() => { setSelectedSourceId(''); createNewReportFromSelection(); }}>
                        <h4 className="font-bold text-blue-800">Boş Rapor Başlat</h4>
                        <p className="text-xs text-blue-600">Sıfırdan temiz bir rapor oluşturur.</p>
                      </div>
                      {reports.length > 0 && (
                        <div className="border-t pt-4">
                          <label className="text-sm font-bold text-slate-700 mb-2 block">Veya Eskiden Kopyala:</label>
                          <select className="w-full p-3 border rounded-lg bg-slate-50 text-sm mb-3" value={selectedSourceId} onChange={(e) => setSelectedSourceId(e.target.value)}>
                            <option value="">-- Rapor Seçin --</option>
                            {reports.map(r => (<option key={r.id} value={r.id}>{r.date} - Rapor #{r.reportNo}</option>))}
                          </select>
                          <button onClick={createNewReportFromSelection} disabled={!selectedSourceId} className="w-full bg-slate-800 text-white py-2 rounded-lg font-bold text-sm disabled:opacity-50">
                            Seçileni Kopyala
                          </button>
                        </div>
                      )}
                    </div>
                    <button onClick={() => setShowNewReportDialog(false)} className="mt-6 w-full text-slate-500 text-xs">İptal</button>
                  </div>
                </div>
            )}
            <div className="bg-slate-900 text-white p-6 shadow-lg rounded-b-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold">Şantiye Asistanı</h1>
                    <div className="flex gap-2 items-center">
                        <button onClick={() => auth.signOut()} className="text-xs text-slate-400 hover:text-red-400">Çıkış</button>
                        <div className="bg-slate-800 p-2 rounded-full"><HardHat className="text-amber-500" size={24}/></div>
                    </div>
                </div>
                <button onClick={handleNewReportClick} className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold py-3 rounded-xl flex justify-center gap-2">
                    <Plus size={20}/> Yeni Rapor
                </button>
                <p className="mt-4 text-xs text-slate-400 text-center">Giriş Yapan: <span className="font-bold text-amber-300">{displayName}</span></p>
            </div>
            <div className="p-4 space-y-3">
                {reports.map(r => (
                    <div key={r.id} onClick={() => { setFormData(r); setCurrentReportId(r.id); setView('view'); }} className="bg-white p-4 rounded-xl shadow-sm border hover:border-amber-300 cursor-pointer relative">
                        <div className="font-semibold">{r.projectTitle}</div>
                        <div className="text-sm text-slate-500">Rapor No: {r.reportNo} ({r.date})</div>
                        <div className="text-xs mt-1 text-slate-400">Giren: {r.enteredBy || 'Anonim'}</div>
                        <button onClick={(e) => handleDeleteClick(r.id, e)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 p-2"><Trash2 size={20}/></button>
                    </div>
                ))}
            </div>
        </div>
    );
  }

  if (view === 'view') {
    const activeEmployees = formData.employeeList?.filter(e => e.status !== 'exited' && e.status !== 'pending_exit') || [];
    const exitedEmployees = formData.employeeList?.filter(e => e.status === 'exited') || [];
    return (
        <div className="bg-slate-100 min-h-screen p-4">
            <div className="max-w-3xl mx-auto bg-white shadow-lg">
                <div className="flex justify-between p-4 border-b">
                    <button onClick={() => setView('list')} className="flex items-center gap-1"><ChevronLeft/> Geri</button>
                    <div className="flex gap-2">
                        <button onClick={handleDownloadPDF} className="bg-blue-600 text-white px-3 py-1 rounded flex items-center gap-2"><Download size={16}/> PDF</button>
                        <button onClick={() => setView('form')} className="border px-3 py-1 rounded">Düzenle</button>
                    </div>
                </div>
                <div id="printable-area" className="p-8 text-xs">
                    <div className="border-2 border-slate-900 p-4 mb-4 text-center font-bold text-xl">GÜNLÜK İLERLEME RAPORU - {formData.date}</div>
                    
                    <div className="grid grid-cols-2 border-2 border-slate-900 mb-4">
                       <div className="p-3 border-r border-slate-900">
                          <div className="font-bold text-lg uppercase">{formData.projectTitle}</div>
                          <div className="text-slate-500">{formData.location}</div>
                          <div className="mt-2 font-semibold">{formData.contractor}</div>
                          <div className="text-slate-500 text-[10px]">Sözleşme No: {formData.contractNo}</div>
                       </div>
                       <div className="p-3 flex flex-col justify-between text-right">
                          <div className="font-bold text-xl">Rapor No: {formData.reportNo}</div>
                          <div className="text-xs mt-1 text-slate-400">Giren: {formData.enteredBy || 'Anonim'}</div>
                       </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="border border-slate-300 p-2 flex justify-between items-center bg-slate-50">
                            <div className="flex items-center gap-2"><Cloud size={16}/> <span className="font-bold">{formData.weather || "-"}</span></div>
                            <div className="flex items-center gap-2"><Thermometer size={16} /> {formatTemp(formData.tempMax)} / {formatTemp(formData.tempMin)}</div>
                        </div>
                        {formData.isWindy && <div className="border border-blue-200 bg-blue-50 p-2 flex items-center gap-2 text-blue-700 font-bold"><Wind size={16}/> RÜZGARLI</div>}
                    </div>

                    <div className="mb-4 border border-red-200 bg-red-50 p-2 rounded page-break-inside-avoid">
                       <h3 className="font-bold text-red-800 border-b border-red-200 mb-2 flex items-center gap-1"><ShieldAlert size={14}/> 3. İŞ SAĞLIĞI VE GÜVENLİĞİ</h3>
                       <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                          <div className="flex justify-between"><span>İş Başı Konuşması (Toolbox) Yapıldı mı?</span> <span className="font-bold">{formData.safety.toolboxTalk ? 'EVET' : 'HAYIR'}</span></div>
                          <div className="flex justify-between"><span>Kaza / Olay?</span> <span className="font-bold text-red-600">{formData.safety.accident ? 'EVET' : 'HAYIR'}</span></div>
                          <div className="flex justify-between"><span>Riskli Çalışma (Kulevinç, Elektrik vb.)?</span> <span className="font-bold">{formData.safety.highRisk ? 'EVET' : 'HAYIR'}</span></div>
                          <div className="flex justify-between"><span>Çevre Olayı?</span> <span className="font-bold">{formData.safety.envSpill ? 'EVET' : 'HAYIR'}</span></div>
                       </div>
                    </div>

                    <div className="mb-4 page-break-inside-avoid">
                      <h3 className="bg-slate-200 p-1 font-bold mb-1">4. PERSONEL DAĞILIMI</h3>
                      <table className="w-full border-collapse border mb-4">
                          <thead><tr className="bg-slate-100"><th className="border p-1">Firma</th><th className="border p-1">Görevi</th><th className="border p-1 text-center">Sayı</th><th className="border p-1 text-center">Saat</th></tr></thead>
                          <tbody>
                              {formData.staff.length > 0 ? formData.staff.map((s, i) => (
                                  <tr key={i}>
                                      <td className="border p-1">{s.company}</td>
                                      <td className="border p-1">{s.role}</td>
                                      <td className="border p-1 text-center">{s.count}</td>
                                      <td className="border p-1 text-center">{s.hours}</td>
                                  </tr>
                              )) : <tr><td colSpan="4" className="border p-1 text-center text-slate-400">Veri yok</td></tr>}
                          </tbody>
                      </table>
                    </div>

                    <div className="mb-4 page-break-inside-avoid">
                      <h3 className="font-bold bg-slate-200 p-1 mb-1">5. MAKİNA & EKİPMAN</h3>
                      <table className="w-full border-collapse border border-slate-300">
                        <thead>
                          <tr className="bg-slate-100 text-left">
                            <th className="border border-slate-300 p-1">Ekipman</th>
                            <th className="border border-slate-300 p-1">Firma</th>
                            <th className="border border-slate-300 p-1 text-center">Adet</th>
                            <th className="border p-1 text-center">Saat</th>
                          </tr>
                        </thead>
                        <tbody>
                          {formData.equipment.length > 0 ? formData.equipment.map((e, i) => (
                            <tr key={i}>
                              <td className="border border-slate-300 p-1">{e.type}</td>
                              <td className="border border-slate-300 p-1">{e.company}</td>
                              <td className="border border-slate-300 p-1 text-center">{e.count}</td>
                              <td className="border p-1 text-center">{e.hours}</td>
                            </tr>
                          )) : <tr><td colSpan="4" className="border p-1 text-center text-slate-400">Veri yok</td></tr>}
                        </tbody>
                      </table>
                    </div>

                    <div className="mb-4 border border-slate-300 p-2 page-break-inside-avoid">
                        <h3 className="font-bold mb-2 flex items-center gap-2"><Truck size={14}/> 6. MALZEME VE LOJİSTİK</h3>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="flex items-center gap-2"><Utensils size={14} className="text-slate-500"/> <span>Yemek: <strong>{formData.meals}</strong></span></div>
                            <div className="flex items-center gap-2"><Boxes size={14} className="text-slate-500"/><span>Beton: <strong>{formData.concrete.poured ? `${formData.concrete.quantity} m³` : 'YOK'}</strong></span></div>
                            <div className="flex items-center gap-2"><Boxes size={14} className="text-slate-500"/><span>Demir: <strong>{formData.rebar ? `${formData.rebar} ton` : '-'}</strong></span></div>
                        </div>
                        {formData.otherMaterials.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-100">
                            <span className="font-semibold">Diğer: </span>
                            {formData.otherMaterials.map((m, i) => (<span key={i} className="mr-3">{m.name} ({m.quantity}),</span>))}
                          </div>
                        )}
                    </div>

                    <div className="mb-4 page-break-inside-avoid">
                      <h3 className="font-bold bg-slate-200 p-1 mb-1">7. YAPILAN İMALATLAR</h3>
                      {formData.tasks.length > 0 ? (
                        <ul className="border border-slate-300 p-2 list-disc list-inside">
                          {formData.tasks.map((t, i) => (
                            <li key={i} className="mb-1"><span className="font-semibold">{t.description}</span> <span className="text-[10px] ml-2 px-1 bg-slate-100 border rounded">{t.status}</span></li>
                          ))}
                        </ul>
                      ) : <div className="border border-slate-300 p-2 text-center text-slate-400">Veri yok</div>}
                    </div>

                    <div className="mb-4 page-break-inside-avoid">
                        <h3 className="font-bold bg-slate-200 p-1 mb-1">8. NOTLAR VE GÜNCELLEMELER</h3>
                        <div className="border border-slate-300 p-2 space-y-2">
                            {formData.impactNotes ? <div><span className="font-bold text-red-700">KRİTİK:</span> {formData.impactNotes}</div> : <div><span className="font-bold text-slate-400">Kritik Not:</span> -</div>}
                            {formData.projectUpdate ? <div><span className="font-bold text-blue-700">PROJE:</span> {formData.projectUpdate}</div> : <div><span className="font-bold text-slate-400">Proje Güncellemesi:</span> -</div>}
                            {formData.notes ? <div className="whitespace-pre-line text-justify">{formData.notes}</div> : <div className="text-slate-400">Genel not yok.</div>}
                        </div>
                    </div>

                    <div className="mb-4 page-break-inside-avoid">
                        <h3 className="font-bold bg-slate-200 p-1 mb-1">9. SAHA GÖRSELLERİ</h3>
                        {formData.images.length > 0 ? (
                          <div className="grid grid-cols-2 gap-4">
                            {formData.images.map((img, i) => (
                              <div key={i} className="flex flex-col border border-slate-200 break-inside-avoid">
                                 <div className="h-48 bg-slate-50 relative overflow-hidden border-b border-slate-200 flex items-center justify-center">
                                       <img src={img.url} alt={`Site ${i}`} className="w-full h-full object-contain" />
                                 </div>
                                 <div className="p-1 bg-white"><div className="text-xs font-semibold text-center text-slate-800">{img.description || "-"}</div></div>
                              </div>
                            ))}
                          </div>
                        ) : <div className="border border-slate-300 p-2 text-center text-slate-400">Görsel yüklenmedi.</div>}
                    </div>

                    {formData.concrete.poured && formData.concrete.planImage && (
                       <div className="mb-4 border border-slate-300 p-2 page-break-inside-avoid">
                          <h3 className="font-bold mb-2 flex items-center gap-2"><Map size={14}/> BETON DÖKÜM PLANI</h3>
                          <div className="aspect-[21/9] bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden">
                              <img src={formData.concrete.planImage} alt="Concrete Plan" className="w-full h-full object-contain"/>
                          </div>
                       </div>
                    )}

                    <div className="mb-4 page-break-before-auto">
                        <h3 className="font-bold bg-slate-200 p-1 mb-1">10. GÜNCEL ÇALIŞAN LİSTESİ</h3>
                        <table className="w-full border">
                            <thead><tr className="bg-slate-100"><th className="border p-1">Adı Soyadı</th><th className="border p-1">Görevi</th><th className="border p-1">Durum</th><th className="border p-1">Mesai</th><th className="border p-1">Açıklama</th></tr></thead>
                            <tbody>
                                {activeEmployees.length > 0 ? activeEmployees.map((e, i) => (
                                    <tr key={i}>
                                        <td className="border p-1">{e.name}</td>
                                        <td className="border p-1">{e.role}</td>
                                        <td className="border p-1">{e.attendance === 'worked' ? 'Çalıştı' : 'Yok'}</td>
                                        <td className="border p-1 text-center">{e.hasOvertime ? `+${e.overtimeHours}` : '-'}</td>
                                        <td className="border p-1">{e.absenceReason || '-'}</td>
                                    </tr>
                                )) : <tr><td colSpan="5" className="border p-1 text-center text-slate-400">Liste boş</td></tr>}
                            </tbody>
                        </table>
                        {exitedEmployees.length > 0 && (
                            <div className="mt-2">
                                <h4 className="font-bold text-xs text-slate-500 mb-1">AYRILANLAR</h4>
                                {exitedEmployees.map((e, i) => (
                                    <div key={i} className="text-[10px] text-slate-400 border-b">{e.name} ({e.role}) - Çıkış: {new Date(e.exitDate).toLocaleDateString('tr-TR')}</div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="mt-8 pt-4 border-t-2 border-slate-900 flex justify-between page-break-inside-avoid">
                      <div className="text-center w-32"><div className="font-bold mb-8">Yüklenici</div><div className="border-t border-slate-400 pt-1">İmza</div></div>
                      <div className="text-center w-32"><div className="font-bold mb-8">Kontrol</div><div className="border-t border-slate-400 pt-1">İmza</div></div>
                    </div>
                </div>
            </div>
        </div>
    );
  }

  // --- FORM VIEW ---
  if (view === 'form') {
    const sortedEmployees = groupEmployeesByRole(formData.employeeList, formData.staff);

    return (
      <div className="max-w-2xl mx-auto bg-white min-h-screen flex flex-col pb-20">
        <div className="bg-slate-900 text-white p-4 sticky top-0 z-10 flex justify-between items-center shadow-md">
            <button onClick={() => setView('list')}><ChevronLeft/></button>
            <h1 className="font-bold">Rapor Düzenle</h1>
            <button onClick={handleSave} className="flex items-center gap-1 bg-amber-500 text-slate-900 px-3 py-1 rounded font-bold"><Save size={16}/> Kaydet</button>
        </div>
        {statusMsg && <div className="bg-green-100 text-green-800 p-2 text-center text-sm">{statusMsg.text}</div>}

        <div className="p-4 space-y-6">
            <div className="bg-slate-50 p-3 rounded border space-y-3">
                <h3 className="font-bold text-slate-700 border-b pb-1">1. PROJE BİLGİLERİ</h3>
                <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder="Proje Başlığı" className="p-2 border rounded" value={formData.projectTitle} onChange={e => setFormData({...formData, projectTitle: e.target.value})} />
                    <input type="date" className="p-2 border rounded" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                    <input type="text" placeholder="Konum (Şehir)" className="p-2 border rounded" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} />
                    <input type="text" placeholder="Yüklenici" className="p-2 border rounded" value={formData.contractor} onChange={e => setFormData({...formData, contractor: e.target.value})} />
                    <div className="flex items-center gap-1"><span className="text-xs font-bold">Rapor No:</span><input type="text" className="p-2 border rounded w-full" value={formData.reportNo} onChange={e => setFormData({...formData, reportNo: e.target.value})} /></div>
                    <input type="text" placeholder="Sözleşme No" className="p-2 border rounded" value={formData.contractNo} onChange={e => setFormData({...formData, contractNo: e.target.value})} />
                </div>
            </div>

            <div className="bg-slate-50 p-3 rounded border space-y-3">
                <div className="flex justify-between items-center border-b pb-1">
                    <h3 className="font-bold text-slate-700">2. HAVA DURUMU</h3>
                    <button onClick={handleGetWeatherAI} disabled={weatherLoading} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 flex items-center gap-1 font-bold">{weatherLoading ? <Loader2 size={12} className="animate-spin"/> : <Cloud size={12}/>} AI Getir</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <input type="text" placeholder="Durum" className="col-span-3 p-2 border rounded" value={formData.weather} onChange={e => setFormData({...formData, weather: e.target.value})} />
                    <input type="text" placeholder="Max" className="p-2 border rounded" value={formData.tempMax} onChange={e => setFormData({...formData, tempMax: e.target.value})} />
                    <input type="text" placeholder="Min" className="p-2 border rounded" value={formData.tempMin} onChange={e => setFormData({...formData, tempMin: e.target.value})} />
                    <label className="flex items-center gap-2 col-span-3 bg-white p-2 rounded border"><input type="checkbox" checked={formData.isWindy} onChange={e=>setFormData({...formData, isWindy: e.target.checked})} /> <span className="text-sm"><Wind size={14}/> Rüzgarlı</span></label>
                </div>
            </div>

            <div className="bg-red-50 p-3 rounded border border-red-100 space-y-2">
                <h3 className="font-bold text-red-800 border-b border-red-200 pb-1">3. İŞ GÜVENLİĞİ</h3>
                <label className="flex items-center gap-2"><input type="checkbox" checked={formData.safety.toolboxTalk} onChange={e=>setFormData({...formData, safety: {...formData.safety, toolboxTalk: e.target.checked}})} /> <span className="text-sm">İş Başı Konuşması (Toolbox)</span></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={formData.safety.accident} onChange={e=>setFormData({...formData, safety: {...formData.safety, accident: e.target.checked}})} /> <span className="text-sm font-bold text-red-600">Kaza Var</span></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={formData.safety.highRisk} onChange={e=>setFormData({...formData, safety: {...formData.safety, highRisk: e.target.checked}})} /> <span className="text-sm">Riskli Çalışma (Kulevinç, Elektrik vb.)</span></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={formData.safety.envSpill} onChange={e=>setFormData({...formData, safety: {...formData.safety, envSpill: e.target.checked}})} /> <span className="text-sm">Çevre Olayı</span></label>
            </div>

            <div className="bg-slate-50 p-3 rounded border space-y-2">
                <h3 className="font-bold text-slate-700 border-b pb-1">4. PERSONEL EKİPLERİ</h3>
                <p className="text-[10px] text-slate-500">Bu ekipler, aşağıdaki listeden kişi eklendiğinde ve "Çalıştı" seçildiğinde otomatik güncellenir.</p>
                {formData.staff.map((group, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                        <input type="text" placeholder="Firma" className="col-span-4 p-2 border rounded text-xs" value={group.company} onChange={e => updateStaff(i, 'company', e.target.value)} />
                        <input type="text" placeholder="Ekip (Örn: Demirci)" className="col-span-4 p-2 border rounded text-xs" value={group.role} onChange={e => updateStaff(i, 'role', e.target.value)} />
                        <div className="col-span-2 flex items-center justify-center bg-white border rounded text-xs font-bold text-slate-900 h-9">{group.count}</div>
                        <div className="col-span-2 flex items-center justify-center bg-slate-200 rounded text-xs font-bold text-slate-600 h-9 relative">
                            {group.hours} sa
                            <button onClick={() => { const n = [...formData.staff]; n.splice(i, 1); setFormData({...formData, staff: n}); }} className="absolute -right-6 text-red-500"><Trash2 size={16}/></button>
                        </div>
                    </div>
                ))}
                <button onClick={addStaffGroup} className="text-xs text-blue-600 font-bold flex items-center gap-1"><Plus size={14}/> Yeni Ekip Tanımla</button>
            </div>

            <div className="bg-slate-50 p-3 rounded border space-y-2">
                <h3 className="font-bold text-slate-700 border-b pb-1">5. MAKİNA & EKİPMAN</h3>
                {formData.equipment.map((item, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                        <input type="text" placeholder="Cinsi" className="col-span-4 p-2 border rounded text-xs" value={item.type} onChange={e => { const n = [...formData.equipment]; n[i].type = e.target.value; setFormData({...formData, equipment: n}) }} />
                        <input type="text" placeholder="Firma" className="col-span-4 p-2 border rounded text-xs" value={item.company} onChange={e => { const n = [...formData.equipment]; n[i].company = e.target.value; setFormData({...formData, equipment: n}) }} />
                        <input type="number" placeholder="Adet" className="col-span-2 p-2 border rounded text-xs" value={item.count} onChange={e => { const n = [...formData.equipment]; n[i].count = e.target.value; setFormData({...formData, equipment: n}) }} />
                        <div className="col-span-2 flex gap-1">
                             <input type="number" placeholder="Saat" className="w-full p-2 border rounded text-xs" value={item.hours} onChange={e => { const n = [...formData.equipment]; n[i].hours = e.target.value; setFormData({...formData, equipment: n}) }} />
                             <button onClick={() => {const n = [...formData.equipment]; n.splice(i,1); setFormData({...formData, equipment: n})}} className="text-red-500"><Trash2 size={16}/></button>
                        </div>
                    </div>
                ))}
                <button onClick={() => setFormData({...formData, equipment: [...formData.equipment, { type: '', count: '', company: '', hours: 8 }]})} className="text-xs text-blue-600 font-bold flex items-center gap-1"><Plus size={14}/> Ekipman Ekle</button>
            </div>

            <div className="bg-slate-50 p-3 rounded border space-y-2">
                <h3 className="font-bold text-slate-700 border-b pb-1">6. MALZEME VE LOJİSTİK</h3>
                <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2"><span className="text-xs font-bold">Yemek:</span> <input type="number" className="w-16 p-1 border rounded font-bold text-center" value={formData.meals} readOnly /></div>
                    <div><input type="text" placeholder="Demir (Ton)" className="w-full p-2 border rounded text-sm" value={formData.rebar} onChange={e=>setFormData({...formData, rebar: e.target.value})} /></div>
                </div>
                <div className="border p-2 rounded bg-white">
                    <label className="flex items-center gap-2 mb-2"><input type="checkbox" checked={formData.concrete.poured} onChange={e=>setFormData({...formData, concrete: {...formData.concrete, poured: e.target.checked}})} /><span className="text-sm font-bold">Beton Döküldü mü?</span></label>
                    {formData.concrete.poured && (
                        <div className="space-y-2">
                            <input type="text" placeholder="Miktar (m3) ve Bölge" className="w-full p-2 border rounded text-sm" value={formData.concrete.quantity} onChange={e=>setFormData({...formData, concrete: {...formData.concrete, quantity: e.target.value}})} />
                            <label className="flex items-center gap-2 cursor-pointer justify-center text-blue-600 font-semibold text-sm p-2 border border-dashed bg-blue-50 rounded">
                                <Map size={18}/> {formData.concrete.planImage ? 'Planı Değiştir' : 'Kroki / Fotoğraf Ekle'}
                                <input type="file" accept="image/*" className="hidden" onChange={handleConcretePlanUpload} />
                            </label>
                            {formData.concrete.planImage && <img src={formData.concrete.planImage} className="w-full h-32 object-contain border rounded" alt="Plan"/>}
                        </div>
                    )}
                </div>
                {formData.otherMaterials.map((m, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                        <input type="text" placeholder="Malzeme" className="flex-1 p-2 border rounded text-xs" value={m.name} onChange={e=>{const n=[...formData.otherMaterials]; n[i].name=e.target.value; setFormData({...formData, otherMaterials: n})}}/>
                        <input type="text" placeholder="Miktar" className="w-24 p-2 border rounded text-xs" value={m.quantity} onChange={e=>{const n=[...formData.otherMaterials]; n[i].quantity=e.target.value; setFormData({...formData, otherMaterials: n})}}/>
                        <button onClick={() => { const n = formData.otherMaterials.filter((_, idx) => idx !== i); setFormData({...formData, otherMaterials: n}); }} className="text-red-500"><Trash2 size={16}/></button>
                    </div>
                ))}
                <button onClick={() => setFormData({...formData, otherMaterials: [...formData.otherMaterials, { name: '', quantity: '' }]})} className="text-xs text-blue-600 font-bold flex items-center gap-1"><Plus size={14} /> Malzeme Ekle</button>
            </div>

            <div className="bg-slate-50 p-3 rounded border space-y-2">
                <h3 className="font-bold text-slate-700 border-b pb-1">7. YAPILAN İMALATLAR</h3>
                {formData.tasks.map((t, i) => (
                    <div key={i} className="flex gap-2">
                        <textarea className="flex-1 p-2 border rounded text-sm h-16" value={t.description} onChange={e => {const n=[...formData.tasks]; n[i].description=e.target.value; setFormData({...formData, tasks: n})}} />
                        <div className="flex flex-col gap-2">
                            <select className="p-1 border rounded text-xs" value={t.status} onChange={e => {const n=[...formData.tasks]; n[i].status=e.target.value; setFormData({...formData, tasks: n})}}><option>Devam</option><option>Tamam</option></select>
                            <button onClick={() => {const n=[...formData.tasks]; n.splice(i,1); setFormData({...formData, tasks: n})}} className="text-red-500"><Trash2 size={16}/></button>
                        </div>
                    </div>
                ))}
                <button onClick={() => setFormData({...formData, tasks: [...formData.tasks, { description: '', status: 'Devam' }]})} className="text-xs text-blue-600 font-bold flex items-center gap-1"><Plus size={14}/> İş Ekle</button>
            </div>

            <div className="bg-slate-50 p-3 rounded border space-y-2">
                <h3 className="font-bold text-slate-700 border-b pb-1">8. NOTLAR VE GÜNCELLEMELER</h3>
                <div className="flex justify-end"><button onClick={handleAiEnhance} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-bold">AI Özet</button></div>
                <textarea className="w-full p-2 border rounded h-24 text-sm" placeholder="Notlar..." value={formData.notes} onChange={e=>setFormData({...formData, notes: e.target.value})}/>
            </div>

            <div className="bg-slate-50 p-3 rounded border space-y-2">
                <h3 className="font-bold text-slate-700 border-b pb-1">9. FOTOĞRAFLAR</h3>
                <div className="grid grid-cols-2 gap-2">
                    {formData.images.map((img, i) => (
                        <div key={i} className="border rounded p-1 relative">
                            <img src={img.url} className="h-24 w-full object-cover rounded" alt="site"/>
                            <input type="text" placeholder="Açıklama" className="w-full text-xs border p-1 mt-1" value={img.description} onChange={e => updateImageDescription(i, e.target.value)}/>
                            <button onClick={() => removeImage(i)} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full"><X size={12}/></button>
                        </div>
                    ))}
                    <label className="border-2 border-dashed h-24 flex items-center justify-center cursor-pointer bg-white"><ImageIcon/><input type="file" className="hidden" onChange={handleImageUpload}/></label>
                </div>
            </div>

            <div className="bg-blue-50 p-3 rounded border border-blue-200 space-y-3">
                <h3 className="font-bold text-blue-800 border-b border-blue-200 pb-1">10. KİŞİ LİSTESİ & MESAİ</h3>
                {sortedEmployees.filter(e => e.status !== 'exited').map((emp) => {
                    const realIndex = formData.employeeList.findIndex(e => e.id === emp.id);
                    const isPending = emp.status === 'pending_exit';

                    return (
                        <div key={emp.id} className={`bg-white p-3 rounded border shadow-sm space-y-2 ${isPending ? 'opacity-50 border-red-500' : ''}`}>
                            {isPending && pendingRemoval && pendingRemoval.id === emp.id ? (
                                <div className="text-center p-2 bg-red-100 rounded">
                                    <p className="text-red-700 font-bold mb-2">Kişi Çıkarılıyor...</p>
                                    <button onClick={undoTermination} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm font-bold flex items-center justify-center mx-auto gap-2">
                                        <RotateCcw size={16}/> Geri Al ({pendingRemoval.timer})
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="flex gap-2">
                                        <input type="text" placeholder="Ad Soyad" className="flex-1 p-2 border rounded text-sm" value={emp.name} onChange={e=>updateEmployee(realIndex, 'name', e.target.value)} />
                                        <select className="flex-1 p-2 border rounded text-sm" value={emp.role} onChange={e=>updateEmployee(realIndex, 'role', e.target.value)}>
                                            <option value="">Görevi Seç...</option>
                                            {formData.staff.map((s, k) => (<option key={k} value={s.role}>{s.role}</option>))}
                                            <option value="Diğer">Diğer</option>
                                        </select>
                                    </div>
                                    <div className="flex justify-between items-center bg-slate-50 p-2 rounded">
                                        <div className="flex gap-2">
                                            <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name={`att_${emp.id}`} checked={emp.attendance === 'worked'} onChange={()=>updateEmployee(realIndex, 'attendance', 'worked')} /><span className="text-xs font-bold text-green-700">Çalıştı</span></label>
                                            <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name={`att_${emp.id}`} checked={emp.attendance === 'absent'} onChange={()=>updateEmployee(realIndex, 'attendance', 'absent')} /><span className="text-xs font-bold text-red-700">Yok</span></label>
                                        </div>
                                        <div className="flex items-center gap-2 border-l pl-2">
                                            <label className="flex items-center gap-1 cursor-pointer text-xs">
                                                <input type="checkbox" checked={emp.hasOvertime} onChange={e=>updateEmployee(realIndex, 'hasOvertime', e.target.checked)} /> Mesai
                                            </label>
                                            {emp.hasOvertime && (
                                                <div className="flex items-center gap-1">
                                                    <input type="number" className="w-10 p-1 border rounded text-xs text-center" value={emp.overtimeHours} onChange={e=>updateEmployee(realIndex, 'overtimeHours', e.target.value)} />
                                                    <span className="text-[10px] text-slate-500">sa</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <input type="text" placeholder="Açıklama / Neden gelmedi?" className="w-full mt-2 p-2 border border-slate-200 rounded text-sm bg-slate-50" value={emp.absenceReason} onChange={e=>updateEmployee(realIndex, 'absenceReason', e.target.value)} />
                                    <div className="flex justify-end mt-1 gap-2">
                                        <button onClick={() => deleteEmployeeRow(emp.id)} className="text-xs text-slate-400 hover:text-slate-600 p-1 rounded flex items-center"><Trash2 size={14}/> Sil</button>
                                        <button onClick={() => terminateEmployeeWithUndo(emp)} className="text-xs text-red-500 flex items-center hover:bg-red-50 p-1 rounded"><UserX size={14}/> Çıkar</button>
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}
                <button onClick={addEmployee} className="w-full py-2 border-2 border-dashed border-blue-300 text-blue-600 rounded font-bold text-sm flex justify-center gap-2"><UserPlus size={16}/> Kişi Ekle</button>
            </div>

        </div>
      </div>
    );
  }

  return null;
}