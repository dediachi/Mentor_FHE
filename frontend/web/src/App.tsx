import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface MentorData {
  id: string;
  name: string;
  skill: string;
  experience: number;
  rating: number;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [mentors, setMentors] = useState<MentorData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingMentor, setCreatingMentor] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newMentorData, setNewMentorData] = useState({ name: "", skill: "", experience: "", rating: "" });
  const [selectedMentor, setSelectedMentor] = useState<MentorData | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSkill, setFilterSkill] = useState("");
  const [showFAQ, setShowFAQ] = useState(false);
  const [stats, setStats] = useState({ total: 0, verified: 0, avgRating: 0 });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [contractAddress, setContractAddress] = useState("");

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const mentorsList: MentorData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          mentorsList.push({
            id: businessId,
            name: businessData.name,
            skill: businessData.description,
            experience: Number(businessData.publicValue1) || 0,
            rating: Number(businessData.publicValue2) || 0,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setMentors(mentorsList);
      updateStats(mentorsList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const updateStats = (mentorsList: MentorData[]) => {
    const total = mentorsList.length;
    const verified = mentorsList.filter(m => m.isVerified).length;
    const avgRating = total > 0 ? mentorsList.reduce((sum, m) => sum + m.rating, 0) / total : 0;
    setStats({ total, verified, avgRating });
  };

  const createMentor = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingMentor(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating mentor profile with FHE encryption..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const experienceValue = parseInt(newMentorData.experience) || 0;
      const businessId = `mentor-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, experienceValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newMentorData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newMentorData.rating) || 0,
        0,
        newMentorData.skill
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Mentor profile created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewMentorData({ name: "", skill: "", experience: "", rating: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected" 
        : "Creation failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingMentor(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        setTransactionStatus({ visible: true, status: "success", message: "Data already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return Number(businessData.decryptedValue) || 0;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Data decrypted successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Data is already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadData();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const available = await contract.isAvailable();
      setTransactionStatus({ visible: true, status: "success", message: "System is available and ready!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredMentors = mentors.filter(mentor => 
    mentor.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (filterSkill === "" || mentor.skill.toLowerCase().includes(filterSkill.toLowerCase()))
  );

  const skills = [...new Set(mentors.map(m => m.skill))];

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>Private Mentorship Matching 🔐</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🎯</div>
            <h2>Connect Your Wallet to Start Matching</h2>
            <p>Connect your wallet to access encrypted mentorship matching with FHE protection.</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect wallet to initialize FHE system</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>Create your encrypted mentor profile</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Start matching with privacy protection</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
        <p className="loading-note">Securing your mentorship data</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading mentorship system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>Private Mentorship Matching 🔐</h1>
          <p>Encrypted mentor-student matching with FHE</p>
        </div>
        
        <div className="header-actions">
          <button onClick={checkAvailability} className="status-btn">
            Check System
          </button>
          <button onClick={() => setShowCreateModal(true)} className="create-btn">
            + Add Mentor
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="stats-panel">
          <div className="stat-card">
            <h3>Total Mentors</h3>
            <div className="stat-value">{stats.total}</div>
          </div>
          <div className="stat-card">
            <h3>Verified Profiles</h3>
            <div className="stat-value">{stats.verified}</div>
          </div>
          <div className="stat-card">
            <h3>Avg Rating</h3>
            <div className="stat-value">{stats.avgRating.toFixed(1)}</div>
          </div>
          <div className="stat-card">
            <h3>FHE Status</h3>
            <div className="stat-value active">Active</div>
          </div>
        </div>

        <div className="controls-panel">
          <div className="search-section">
            <input
              type="text"
              placeholder="Search mentors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <select 
              value={filterSkill} 
              onChange={(e) => setFilterSkill(e.target.value)}
              className="filter-select"
            >
              <option value="">All Skills</option>
              {skills.map(skill => (
                <option key={skill} value={skill}>{skill}</option>
              ))}
            </select>
            <button onClick={loadData} className="refresh-btn" disabled={isRefreshing}>
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          
          <div className="action-buttons">
            <button onClick={() => setShowFAQ(true)} className="faq-btn">
              FAQ
            </button>
          </div>
        </div>

        <div className="mentors-grid">
          {filteredMentors.length === 0 ? (
            <div className="no-mentors">
              <p>No mentors found matching your criteria</p>
              <button onClick={() => setShowCreateModal(true)} className="create-btn">
                Add First Mentor
              </button>
            </div>
          ) : (
            filteredMentors.map((mentor, index) => (
              <div className="mentor-card" key={index} onClick={() => setSelectedMentor(mentor)}>
                <div className="card-header">
                  <h3>{mentor.name}</h3>
                  <span className={`status ${mentor.isVerified ? 'verified' : 'pending'}`}>
                    {mentor.isVerified ? '✅ Verified' : '🔒 Encrypted'}
                  </span>
                </div>
                <div className="card-content">
                  <p className="skill">{mentor.skill}</p>
                  <div className="metrics">
                    <span>Rating: ⭐{mentor.rating}/5</span>
                    <span>Exp: {mentor.isVerified ? `${mentor.decryptedValue} years` : '🔒 Encrypted'}</span>
                  </div>
                  <div className="creator">
                    By: {mentor.creator.substring(0, 6)}...{mentor.creator.substring(38)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreateMentor 
          onSubmit={createMentor} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingMentor} 
          mentorData={newMentorData} 
          setMentorData={setNewMentorData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedMentor && (
        <MentorDetailModal 
          mentor={selectedMentor} 
          onClose={() => setSelectedMentor(null)} 
          isDecrypting={fheIsDecrypting} 
          decryptData={() => decryptData(selectedMentor.id)}
        />
      )}
      
      {showFAQ && (
        <FAQModal onClose={() => setShowFAQ(false)} />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ModalCreateMentor: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  mentorData: any;
  setMentorData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, mentorData, setMentorData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'experience') {
      const intValue = value.replace(/[^\d]/g, '');
      setMentorData({ ...mentorData, [name]: intValue });
    } else {
      setMentorData({ ...mentorData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-mentor-modal">
        <div className="modal-header">
          <h2>Add New Mentor</h2>
          <button onClick={onClose} className="close-modal">×</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 Protection</strong>
            <p>Experience years will be encrypted with FHE technology</p>
          </div>
          
          <div className="form-group">
            <label>Mentor Name *</label>
            <input 
              type="text" 
              name="name" 
              value={mentorData.name} 
              onChange={handleChange} 
              placeholder="Enter mentor name..." 
            />
          </div>
          
          <div className="form-group">
            <label>Skill/Expertise *</label>
            <input 
              type="text" 
              name="skill" 
              value={mentorData.skill} 
              onChange={handleChange} 
              placeholder="Enter skill area..." 
            />
          </div>
          
          <div className="form-group">
            <label>Years of Experience (FHE Encrypted) *</label>
            <input 
              type="number" 
              name="experience" 
              value={mentorData.experience} 
              onChange={handleChange} 
              placeholder="Enter years of experience..." 
              min="0"
            />
            <div className="data-type-label">FHE Encrypted Integer</div>
          </div>
          
          <div className="form-group">
            <label>Rating (1-5) *</label>
            <select name="rating" value={mentorData.rating} onChange={handleChange}>
              <option value="">Select rating</option>
              <option value="1">1 ⭐</option>
              <option value="2">2 ⭐⭐</option>
              <option value="3">3 ⭐⭐⭐</option>
              <option value="4">4 ⭐⭐⭐⭐</option>
              <option value="5">5 ⭐⭐⭐⭐⭐</option>
            </select>
            <div className="data-type-label">Public Data</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !mentorData.name || !mentorData.skill || !mentorData.experience || !mentorData.rating} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "Encrypting..." : "Create Mentor"}
          </button>
        </div>
      </div>
    </div>
  );
};

const MentorDetailModal: React.FC<{
  mentor: MentorData;
  onClose: () => void;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
}> = ({ mentor, onClose, isDecrypting, decryptData }) => {
  const [decryptedExperience, setDecryptedExperience] = useState<number | null>(null);

  const handleDecrypt = async () => {
    const result = await decryptData();
    if (result !== null) {
      setDecryptedExperience(result);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="mentor-detail-modal">
        <div className="modal-header">
          <h2>Mentor Profile</h2>
          <button onClick={onClose} className="close-modal">×</button>
        </div>
        
        <div className="modal-body">
          <div className="mentor-info">
            <div className="info-row">
              <span>Name:</span>
              <strong>{mentor.name}</strong>
            </div>
            <div className="info-row">
              <span>Skill:</span>
              <strong>{mentor.skill}</strong>
            </div>
            <div className="info-row">
              <span>Rating:</span>
              <strong>{"⭐".repeat(mentor.rating)}</strong>
            </div>
            <div className="info-row">
              <span>Experience:</span>
              <strong>
                {mentor.isVerified ? 
                  `${mentor.decryptedValue} years (Verified)` : 
                  decryptedExperience !== null ? 
                  `${decryptedExperience} years (Decrypted)` : 
                  "🔒 Encrypted"
                }
              </strong>
            </div>
            <div className="info-row">
              <span>Created:</span>
              <strong>{new Date(mentor.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
          </div>
          
          <div className="encryption-section">
            <h3>FHE Encryption Status</h3>
            <div className="encryption-status">
              <span className={`status ${mentor.isVerified ? 'verified' : 'encrypted'}`}>
                {mentor.isVerified ? '✅ On-chain Verified' : '🔒 FHE Encrypted'}
              </span>
              <button 
                onClick={handleDecrypt} 
                disabled={isDecrypting || mentor.isVerified}
                className="decrypt-btn"
              >
                {isDecrypting ? "Decrypting..." : mentor.isVerified ? "Already Verified" : "Decrypt Experience"}
              </button>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

const FAQModal: React.FC<{
  onClose: () => void;
}> = ({ onClose }) => {
  const faqs = [
    {
      question: "What is FHE encryption?",
      answer: "FHE (Fully Homomorphic Encryption) allows computations on encrypted data without decryption, protecting your privacy."
    },
    {
      question: "How does mentorship matching work?",
      answer: "Mentors and students are matched based on encrypted skill data, with contact details revealed only after successful matching."
    },
    {
      question: "Is my data secure?",
      answer: "Yes, all sensitive data is encrypted using FHE technology and stored securely on the blockchain."
    }
  ];

  return (
    <div className="modal-overlay">
      <div className="faq-modal">
        <div className="modal-header">
          <h2>Frequently Asked Questions</h2>
          <button onClick={onClose} className="close-modal">×</button>
        </div>
        
        <div className="modal-body">
          {faqs.map((faq, index) => (
            <div key={index} className="faq-item">
              <h3>{faq.question}</h3>
              <p>{faq.answer}</p>
            </div>
          ))}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;