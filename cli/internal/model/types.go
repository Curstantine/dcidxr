package model

type Message struct {
	Content any `json:"content"`
}

type GroupBase struct {
	Circle      string   `json:"circle"`
	Links       []string `json:"links"`
	MissingLink *string  `json:"missingLink"`
	Status      *string  `json:"status"`
	StatusMeta  *string  `json:"statusMeta"`
}

type ReleaseFile struct {
	Name      string `json:"name"`
	SizeBytes int64  `json:"sizeBytes"`
}

type Release struct {
	Name      string        `json:"name"`
	Link      string        `json:"link"`
	Directory bool          `json:"directory"`
	SizeBytes int64         `json:"sizeBytes"`
	Files     []ReleaseFile `json:"files"`
}

type FetchGroup struct {
	GroupBase
	Releases []Release `json:"releases"`
	Errors   []string  `json:"errors"`
}

type TransformOutputPayload struct {
	Groups []GroupBase `json:"groups"`
}

type FetchOutputPayload struct {
	Groups []FetchGroup `json:"groups"`
}

type CircleStatus string

const (
	CircleStatusMissing    CircleStatus = "missing"
	CircleStatusIncomplete CircleStatus = "incomplete"
	CircleStatusComplete   CircleStatus = "complete"
)
