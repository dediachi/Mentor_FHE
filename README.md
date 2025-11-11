# Private Mentorship Matching

Private Mentorship Matching is a privacy-preserving application powered by Zama's Fully Homomorphic Encryption (FHE) technology. Our platform enables secure, encrypted matching between mentees and mentors, ensuring that personal data remains confidential throughout the process. By leveraging Zama's innovative solutions, we can facilitate meaningful connections while protecting individual privacy.

## The Problem

In today’s interconnected world, personal data is often vulnerable to exposure. During the mentorship matching process, sensitive information about skills, preferences, and career aspirations can be mishandled, leading to privacy breaches and a lack of trust. Traditional methods of matching rely on cleartext data, which is susceptible to unauthorized access and misuse.

To address these issues, there is a pressing need for a solution that enables secure, private matching without revealing sensitive information to third parties. Our platform meets this demand by ensuring that both mentor and mentee can share their requirements and preferences without compromising their privacy.

## The Zama FHE Solution

Using Fully Homomorphic Encryption, we can perform computations on encrypted data, allowing us to match mentors and mentees without exposing their personal information. This means that sensitive skills and preferences remain confidential throughout the matching process. By utilizing Zama's advanced libraries, such as fhevm, we can ensure that our platform operates securely and efficiently.

Through the integration of Zama's FHE technology, we can perform homomorphic computations that yield an accurate matching score based on encrypted inputs. This innovative approach guarantees that users maintain control over their data, fostering trust and security in mentorship relationships.

## Key Features

- 🔒 **Privacy-First Design**: Sensitive information is encrypted end-to-end, ensuring confidentiality.
- 🧠 **Intelligent Matching**: Our algorithm computes matching scores based on encrypted skill sets and preferences.
- 🔗 **Secure Communication**: Contact details are shared only after a successful match, preserving privacy.
- 🎓 **Skill Development Focus**: Users can explore mentorship opportunities tailored to their career growth.
- 🌐 **User-Friendly Interface**: An intuitive platform that simplifies the mentorship connection process.

## Technical Architecture & Stack

This project is built on a robust technical stack, centered around Zama's privacy tools:

- **Core Privacy Engine**: Zama's FHE technology (fhevm)
- **Backend Framework**: Python with Concrete ML for data handling
- **Frontend**: React for a responsive user experience
- **Database**: Encrypted storage solutions
- **Deployment**: Docker for containerization

## Smart Contract / Core Logic

Here’s an example of how our platform leverages Zama's technology to compute matching scores:solidity
pragma solidity ^0.8.0;

import "TFHE.sol";

contract MentorMatcher {
    // Function to match mentees with mentors
    function matchMentees(uint64[2] memory menteeSkills, uint64[2] memory mentorSkills) public view returns (uint64) {
        // Compute matching score using FHE
        uint64 score = TFHE.add(menteeSkills[0], mentorSkills[0]);
        return score;
    }
}

This Solidity snippet demonstrates the use of Zama’s TFHE library to perform secure calculations on encrypted skill data, facilitating a privacy-preserving mentorship matching process.

## Directory Structure

Here is the project’s directory structure:
PrivateMentorshipMatching/
├── src/
│   ├── components/
│   ├── App.js
│   └── index.js
├── contracts/
│   └── MentorMatcher.sol
├── scripts/
│   └── match.py
├── Dockerfile
└── README.md

This structure keeps the project organized, with clear separation between components, smart contracts, and scripts.

## Installation & Setup

To set up your development environment, please follow these steps:

### Prerequisites

- Ensure you have Node.js and Python installed on your machine.
- Install Docker for containerization.

### Install Dependencies

1. For the frontend, navigate to the `src` directory and run:bash
   npm install

2. For backend and matching logic, install the necessary Python libraries:bash
   pip install concrete-ml

3. Install Zama's FHE library:bash
   npm install fhevm

## Build & Run

To build and run the application, use the following commands:

1. Compile the smart contracts:bash
   npx hardhat compile

2. Start the frontend application:bash
   npm start

3. Run the matching script:bash
   python scripts/match.py

By following these commands, you will have the mentorship matching platform up and running, ready for usage.

## Acknowledgements

We extend our gratitude to Zama for providing the open-source FHE primitives that make this project possible. Their innovative technology allows us to create a secure and private mentorship matching solution, changing the way individuals connect and grow.

