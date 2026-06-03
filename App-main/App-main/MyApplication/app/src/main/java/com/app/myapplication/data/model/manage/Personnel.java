package com.app.myapplication.data.model.manage;

import com.google.gson.annotations.SerializedName;

public class Personnel {

    @SerializedName("id")
    private String id;

    @SerializedName("username")
    private String username;

    @SerializedName("name")
    private String name;

    @SerializedName("dept")
    private String dept;

    @SerializedName("phone")
    private String phone;

    @SerializedName("role")
    private String role;

    @SerializedName("employeeId")
    private String employeeId;

    @SerializedName("idCard")
    private String idCard;

    @SerializedName("workType")
    private String workType;

    @SerializedName("workTeam")
    private String workTeam;

    @SerializedName("team")
    private String team;

    @SerializedName("company")
    private String company;

    @SerializedName("project")
    private String project;

    @SerializedName("status")
    private String status;

    @SerializedName("entryDate")
    private String entryDate;

    @SerializedName("faceImage")
    private String faceImage;

    @SerializedName("emergencyContact")
    private String emergencyContact;

    public Personnel() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getUsername() { return username != null ? username : name; }
    public void setUsername(String username) { this.username = username; }

    public String getName() { return name != null ? name : username; }
    public void setName(String name) { this.name = name; }

    public String getDept() { return dept; }
    public void setDept(String dept) { this.dept = dept; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getEmployeeId() { return employeeId; }
    public void setEmployeeId(String employeeId) { this.employeeId = employeeId; }

    public String getIdCard() { return idCard; }
    public void setIdCard(String idCard) { this.idCard = idCard; }

    public String getWorkType() { return workType; }
    public void setWorkType(String workType) { this.workType = workType; }

    public String getWorkTeam() { return workTeam; }
    public void setWorkTeam(String workTeam) { this.workTeam = workTeam; }

    public String getTeam() { return team; }
    public void setTeam(String team) { this.team = team; }

    public String getCompany() { return company; }
    public void setCompany(String company) { this.company = company; }

    public String getProject() { return project; }
    public void setProject(String project) { this.project = project; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getEntryDate() { return entryDate; }
    public void setEntryDate(String entryDate) { this.entryDate = entryDate; }

    public String getFaceImage() { return faceImage; }
    public void setFaceImage(String faceImage) { this.faceImage = faceImage; }

    public String getEmergencyContact() { return emergencyContact; }
    public void setEmergencyContact(String emergencyContact) { this.emergencyContact = emergencyContact; }
}
