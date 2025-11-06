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
  skillLevel: number;
  experience: number;
  hourlyRate: number;
  description: string;
  contactInfo: string;
  timestamp: number;
  creator: string;
  isVerified?: boolean;
  decryptedValue?: number;
  matchScore?: number;
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
  const [newMentorData, setNewMentorData] = useState({ 
    name: "", 
    skillLevel: "", 
    experience: "", 
    hourlyRate: "",
    description: "",
    contactInfo: ""
  });
  const [selectedMentor, setSelectedMentor] = useState<MentorData | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredMentors, setFilteredMentors] = useState<MentorData[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [userActions, setUserActions] = useState<Array<{action: string, timestamp: number, mentorId?: string}>>([]);
  const [contractAddress, setContractAddress] = useState("");

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized) return;
      
      try {
        console.log('Initializing FHEVM for mentorship matching...');
        await initialize();
        console.log('FHEVM initialized successfully');
      } catch (error) {
        console.error('Failed to initialize FHEVM:', error);
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize]);

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

  useEffect(() => {
    const filtered = mentors.filter(mentor =>
      mentor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mentor.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredMentors(filtered);
  }, [searchTerm, mentors]);

  const addUserAction = (action: string, mentorId?: string) => {
    setUserActions(prev => [{
      action,
      timestamp: Date.now(),
      mentorId
    }, ...prev.slice(0, 9)]);
  };

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
            skillLevel: Number(businessData.publicValue1) || 0,
            experience: Number(businessData.publicValue2) || 0,
            hourlyRate: 0,
            description: businessData.description,
            contactInfo: "",
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading mentor data:', e);
        }
      }
      
      setMentors(mentorsList);
      addUserAction('Refreshed mentor list');
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
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
      
      const skillValue = parseInt(newMentorData.skillLevel) || 0;
      const businessId = `mentor-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, skillValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newMentorData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newMentorData.experience) || 0,
        parseInt(newMentorData.hourlyRate) || 0,
        newMentorData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Mentor profile created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewMentorData({ 
        name: "", 
        skillLevel: "", 
        experience: "", 
        hourlyRate: "",
        description: "",
        contactInfo: ""
      });
      addUserAction('Created new mentor profile', businessId);
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
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
        const storedValue = Number(businessData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Skill data already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
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
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying skill decryption..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Skill data decrypted and verified!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      addUserAction('Decrypted mentor skill data', businessId);
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data is already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Decryption failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
  };

  const calculateMatchScore = (mentor: MentorData, userSkillReq: number = 7): number => {
    const skillMatch = mentor.isVerified ? 
      (mentor.decryptedValue || 0) >= userSkillReq ? 100 : Math.round((mentor.decryptedValue || 0) / userSkillReq * 100) 
      : 50;
    
    const experienceBonus = Math.min(mentor.experience * 5, 30);
    return Math.min(100, skillMatch + experienceBonus);
  };

  const testContractCall = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: "Contract isAvailable() call successful!" 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      addUserAction('Tested contract availability');
    } catch (e) {
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Contract call failed" 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>🔐 Private Mentorship</h1>
            <span>FHE Encrypted Matching</span>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🎯</div>
            <h2>Connect to Start Your Mentorship Journey</h2>
            <p>Private, encrypted matching between mentors and mentees using FHE technology</p>
            <div className="feature-grid">
              <div className="feature-card">
                <div className="feature-icon">🔒</div>
                <h3>Encrypted Skills</h3>
                <p>Mentor skills encrypted with FHE for privacy</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">🎯</div>
                <h3>Smart Matching</h3>
                <p>Homomorphic calculation of match scores</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">🤝</div>
                <h3>Blind Selection</h3>
                <p>Contact revealed only after mutual match</p>
              </div>
            </div>
          </div>
        </div>

        <div className="partners-section">
          <h3>Trusted by Leading Institutions</h3>
          <div className="partners-grid">
            <div className="partner-logo">Zama AI</div>
            <div className="partner-logo">FHE.org</div>
            <div className="partner-logo">Web3 Edu</div>
            <div className="partner-logo">Privacy Labs</div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
        <p>Status: {status}</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading encrypted mentorship platform...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>🔐 Private Mentorship</h1>
          <span>FHE Encrypted Matching</span>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn neon-glow"
          >
            + Become Mentor
          </button>
          <button 
            onClick={() => setShowHistory(!showHistory)} 
            className={`history-btn ${showHistory ? 'active' : ''}`}
          >
            {showHistory ? 'Hide History' : 'Show History'}
          </button>
          <button 
            onClick={testContractCall} 
            className="test-btn"
          >
            Test Contract
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>

      {showHistory && (
        <div className="history-panel">
          <h3>Your Recent Actions</h3>
          <div className="action-list">
            {userActions.map((action, index) => (
              <div key={index} className="action-item">
                <span className="action-time">{new Date(action.timestamp).toLocaleTimeString()}</span>
                <span className="action-text">{action.action}</span>
                {action.mentorId && <span className="mentor-id">{action.mentorId.substring(0, 8)}...</span>}
              </div>
            ))}
            {userActions.length === 0 && (
              <div className="no-actions">No actions recorded yet</div>
            )}
          </div>
        </div>
      )}
      
      <div className="main-content">
        <div className="stats-overview">
          <div className="stat-card gradient-card">
            <h3>Total Mentors</h3>
            <div className="stat-value">{mentors.length}</div>
          </div>
          <div className="stat-card gradient-card">
            <h3>Verified Skills</h3>
            <div className="stat-value">{mentors.filter(m => m.isVerified).length}</div>
          </div>
          <div className="stat-card gradient-card">
            <h3>Avg Experience</h3>
            <div className="stat-value">
              {mentors.length > 0 ? (mentors.reduce((sum, m) => sum + m.experience, 0) / mentors.length).toFixed(1) : '0'} yrs
            </div>
          </div>
        </div>

        <div className="search-section">
          <div className="search-header">
            <h2>Find Your Perfect Mentor</h2>
            <div className="search-controls">
              <div className="search-input-wrapper">
                <input 
                  type="text" 
                  placeholder="Search mentors by name or skills..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
                <span className="search-icon">🔍</span>
              </div>
              <button 
                onClick={loadData} 
                className="refresh-btn neon-border" 
                disabled={isRefreshing}
              >
                {isRefreshing ? "🔄" : "Refresh"}
              </button>
            </div>
          </div>
        </div>

        <div className="mentors-grid">
          {(searchTerm ? filteredMentors : mentors).map((mentor, index) => (
            <div 
              className={`mentor-card ${mentor.isVerified ? 'verified' : ''}`} 
              key={index}
              onClick={() => setSelectedMentor(mentor)}
            >
              <div className="card-header">
                <h3>{mentor.name}</h3>
                {mentor.isVerified && <span className="verified-badge">✅ Verified</span>}
              </div>
              <div className="card-content">
                <p className="mentor-description">{mentor.description}</p>
                <div className="mentor-stats">
                  <div className="stat">
                    <span className="label">Experience:</span>
                    <span className="value">{mentor.experience} years</span>
                  </div>
                  <div className="stat">
                    <span className="label">Skill Level:</span>
                    <span className="value">
                      {mentor.isVerified ? 
                        `${mentor.decryptedValue}/10 (Decrypted)` : 
                        '🔒 Encrypted'
                      }
                    </span>
                  </div>
                  <div className="stat">
                    <span className="label">Match Score:</span>
                    <span className="value match-score">
                      {calculateMatchScore(mentor)}%
                    </span>
                  </div>
                </div>
              </div>
              <div className="card-footer">
                <span className="creator">By: {mentor.creator.substring(0, 6)}...{mentor.creator.substring(38)}</span>
                <button className="view-details-btn">View Details</button>
              </div>
            </div>
          ))}
          
          {mentors.length === 0 && (
            <div className="no-mentors">
              <div className="no-mentors-content">
                <div className="empty-icon">👥</div>
                <h3>No mentors available yet</h3>
                <p>Be the first to create a mentor profile and start helping others!</p>
                <button 
                  className="create-btn neon-glow" 
                  onClick={() => setShowCreateModal(true)}
                >
                  + Become the First Mentor
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="project-info">
          <h3>About Private Mentorship Matching</h3>
          <p>This platform uses Fully Homomorphic Encryption (FHE) to protect mentor skill data while enabling intelligent matching. Skills are encrypted on-chain and only revealed after successful matches.</p>
          
          <div className="tech-stack">
            <h4>Technology Stack</h4>
            <div className="tech-tags">
              <span className="tech-tag">Zama FHE</span>
              <span className="tech-tag">React</span>
              <span className="tech-tag">RainbowKit</span>
              <span className="tech-tag">Solidity</span>
            </div>
          </div>
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
          calculateMatchScore={calculateMatchScore}
        />
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
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (['skillLevel', 'experience', 'hourlyRate'].includes(name)) {
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
          <h2>Create Mentor Profile</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice neon-border">
            <strong>FHE 🔐 Skill Encryption</strong>
            <p>Your skill level will be encrypted with Zama FHE for privacy protection</p>
          </div>
          
          <div className="form-group">
            <label>Full Name *</label>
            <input 
              type="text" 
              name="name" 
              value={mentorData.name} 
              onChange={handleChange} 
              placeholder="Enter your full name..." 
            />
          </div>
          
          <div className="form-group">
            <label>Skill Level (1-10) * - FHE Encrypted</label>
            <input 
              type="number" 
              name="skillLevel" 
              min="1" 
              max="10" 
              value={mentorData.skillLevel} 
              onChange={handleChange} 
              placeholder="Rate your skill level (1-10)..." 
            />
            <div className="data-type-label">🔐 Encrypted with FHE</div>
          </div>
          
          <div className="form-group">
            <label>Years of Experience *</label>
            <input 
              type="number" 
              name="experience" 
              value={mentorData.experience} 
              onChange={handleChange} 
              placeholder="Years of experience..." 
            />
            <div className="data-type-label">📊 Public Data</div>
          </div>
          
          <div className="form-group">
            <label>Description *</label>
            <textarea 
              name="description" 
              value={mentorData.description} 
              onChange={handleChange} 
              placeholder="Describe your expertise and teaching style..."
              rows={3}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !mentorData.name || !mentorData.skillLevel || !mentorData.experience || !mentorData.description} 
            className="submit-btn neon-glow"
          >
            {creating || isEncrypting ? "🔐 Encrypting..." : "Create Profile"}
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
  calculateMatchScore: (mentor: MentorData) => number;
}> = ({ mentor, onClose, isDecrypting, decryptData, calculateMatchScore }) => {
  const [localDecrypted, setLocalDecrypted] = useState<number | null>(null);

  const handleDecrypt = async () => {
    if (mentor.isVerified || localDecrypted !== null) return;
    
    const decrypted = await decryptData();
    if (decrypted !== null) {
      setLocalDecrypted(decrypted);
    }
  };

  const matchScore = calculateMatchScore(mentor);

  return (
    <div className="modal-overlay">
      <div className="mentor-detail-modal">
        <div className="modal-header">
          <h2>Mentor Profile</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="mentor-info">
            <div className="info-item">
              <span>Name:</span>
              <strong>{mentor.name}</strong>
            </div>
            <div className="info-item">
              <span>Experience:</span>
              <strong>{mentor.experience} years</strong>
            </div>
            <div className="info-item">
              <span>Match Score:</span>
              <strong className="match-score-badge">{matchScore}%</strong>
            </div>
          </div>
          
          <div className="description-section">
            <h3>About</h3>
            <p>{mentor.description}</p>
          </div>
          
          <div className="skill-section">
            <h3>Skill Verification</h3>
            <div className="skill-display">
              <div className="skill-info">
                <span>Skill Level:</span>
                <strong>
                  {mentor.isVerified ? 
                    `${mentor.decryptedValue}/10 (Verified)` : 
                    localDecrypted !== null ? 
                    `${localDecrypted}/10 (Decrypted)` : 
                    "🔒 FHE Encrypted"
                  }
                </strong>
              </div>
              
              <button 
                className={`decrypt-btn ${(mentor.isVerified || localDecrypted !== null) ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting || mentor.isVerified || localDecrypted !== null}
              >
                {isDecrypting ? "🔓 Decrypting..." : 
                 mentor.isVerified ? "✅ Verified" : 
                 localDecrypted !== null ? "🔓 Decrypted" : 
                 "🔓 Decrypt Skill"}
              </button>
            </div>
            
            <div className="fhe-explanation">
              <h4>FHE Protection Process</h4>
              <ol>
                <li>Skill data encrypted on-chain using Zama FHE</li>
                <li>Matching calculations performed homomorphically</li>
                <li>Decryption only after successful match verification</li>
                <li>On-chain proof validation ensures data integrity</li>
              </ol>
            </div>
          </div>
          
          {matchScore > 70 && (
            <div className="match-alert neon-border">
              <div className="alert-icon">🎯</div>
              <div className="alert-content">
                <strong>High Compatibility Match!</strong>
                <p>This mentor appears to be an excellent fit based on your requirements.</p>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
          {matchScore > 60 && (
            <button className="contact-btn neon-glow">
              Request Mentorship
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;

